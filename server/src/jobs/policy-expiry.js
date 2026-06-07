import { supabaseAdmin } from '../supabase.js';
import { sendPolicyExpiryReminder } from '../lib/email.js';

/** Today at UTC midnight (ms), for whole-day diffing against a YYYY-MM-DD date. */
function todayUtcMs() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days from today until a YYYY-MM-DD due date (negative = past due). */
function daysUntil(dateStr) {
  const due = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.round((due - todayUtcMs()) / 86400000);
}

/**
 * Cron job: checks ALL orgs for expired approved policies and transitions them
 * to the dedicated 'overdue' state (kept RED in the UI, due date retained).
 * Only 'approved' policies carry a due date and can expire.
 */
export async function checkAllExpiredPolicies() {
  try {
    const now = new Date().toISOString().split('T')[0];

    const { data: expired } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id, name, user_id, org_id, policy_status')
      .eq('policy_status', 'approved')
      .lt('refresh_date', now);

    if (!expired || expired.length === 0) return;

    for (const policy of expired) {
      const { count } = await supabaseAdmin
        .from('policy_documents')
        .update({ policy_status: 'overdue', updated_at: new Date().toISOString() })
        .eq('policy_id', policy.policy_id)
        .eq('policy_status', 'approved'); // idempotency guard

      if (count === 0) continue;

      // Activity log
      supabaseAdmin.from('all_activity_log').insert({
        action: 'policy_expired',
        module: 'Policy',
        entity_id: policy.policy_id,
        entity_name: policy.name,
        user_id: null,
        org_id: policy.org_id,
        severity: 'warning',
        event_data: {
          message: `Policy "${policy.name}" has expired and is now Overdue`,
          from_status: policy.policy_status,
          to_status: 'overdue',
        },
      }).then(() => {});

      // Notification to policy creator
      if (policy.user_id) {
        supabaseAdmin.from('policy_notifications').insert({
          recipient_id: policy.user_id,
          policy_id: policy.policy_id,
          policy_name: policy.name,
          type: 'policy_expired',
          message: `Policy "${policy.name}" is overdue and requires re-approval`,
          org_id: policy.org_id,
        }).then(() => {});
      }
    }

    console.log(`[policy-expiry] Marked ${expired.length} policy(ies) overdue`);
  } catch (err) {
    console.error('[policy-expiry] Error:', err.message);
  }
}

/**
 * Resolves the deduped recipient email set for a policy's expiry reminders:
 * the approver/reviewer (from policy_approvals), all tenant admins, and the
 * policy owner.
 */
export async function resolveReminderRecipients(policy) {
  const emails = new Set();

  // Approver + reviewer — both are stored as approver_email across the
  // submit-approval / submit-review flows; take the latest few records.
  const { data: approvals } = await supabaseAdmin
    .from('policy_approvals')
    .select('approver_email, created_at')
    .eq('policy_id', policy.policy_id)
    .order('created_at', { ascending: false })
    .limit(5);
  (approvals || []).forEach((a) => a.approver_email && emails.add(a.approver_email.toLowerCase()));

  // Tenant admins
  const { data: admins } = await supabaseAdmin
    .from('org_onboarding')
    .select('email')
    .eq('org_id', policy.org_id)
    .in('role', ['admin', 'tenant_admin'])
    .eq('status', 'active');
  (admins || []).forEach((a) => a.email && emails.add(a.email.toLowerCase()));

  // Policy owner
  if (policy.user_id) {
    const { data: owner } = await supabaseAdmin
      .from('org_onboarding')
      .select('email')
      .eq('user_id', policy.user_id)
      .eq('org_id', policy.org_id)
      .maybeSingle();
    if (owner?.email) emails.add(owner.email.toLowerCase());
  }

  return [...emails];
}

/**
 * Sends escalating expiry reminders (14 / 7 / 1 days before the due date) for
 * approved policies. Each reminder is sent at most once per approval cycle,
 * tracked by reminder_*_sent_at columns (reset to NULL on each approval), so
 * the 6-hour cron is idempotent.
 */
/**
 * Resolves the org's selected policy-expiry email template, memoized per run by
 * org_id. Returns null when the org uses the built-in default (no selection or
 * the referenced template was deleted).
 */
async function makeTemplateResolver() {
  const cache = new Map();
  return async function getTemplate(orgId) {
    if (cache.has(orgId)) return cache.get(orgId);
    let template = null;
    const { data: settings } = await supabaseAdmin
      .from('org_settings')
      .select('policy_expiry_template_id')
      .eq('org_id', orgId)
      .maybeSingle();
    if (settings?.policy_expiry_template_id) {
      const { data: tpl } = await supabaseAdmin
        .from('email_templates')
        .select('subject, body')
        .eq('id', settings.policy_expiry_template_id)
        .eq('org_id', orgId)
        .maybeSingle();
      template = tpl || null;
    }
    cache.set(orgId, template);
    return template;
  };
}

export async function sendExpiryReminders() {
  try {
    const { data: policies } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id, name, user_id, org_id, refresh_date, reminder_14d_sent_at, reminder_7d_sent_at, reminder_1d_sent_at')
      .eq('policy_status', 'approved')
      .not('refresh_date', 'is', null);

    if (!policies || policies.length === 0) return;

    const getTemplate = await makeTemplateResolver();
    let sent = 0;
    for (const p of policies) {
      const days = daysUntil(p.refresh_date);

      // Pick the most urgent unsent reminder whose window we're currently in.
      let col = null;
      if (days <= 1 && days >= 0 && !p.reminder_1d_sent_at) col = 'reminder_1d_sent_at';
      else if (days <= 7 && days > 1 && !p.reminder_7d_sent_at) col = 'reminder_7d_sent_at';
      else if (days <= 14 && days > 7 && !p.reminder_14d_sent_at) col = 'reminder_14d_sent_at';
      if (!col) continue;

      const recipients = await resolveReminderRecipients(p);
      if (recipients.length === 0) continue;

      const template = await getTemplate(p.org_id);
      const result = await sendPolicyExpiryReminder({
        recipients,
        policyId: p.policy_id,
        policyName: p.name,
        dueDate: p.refresh_date,
        window: col,
        template,
      });

      // Only mark sent on an actual delivery — if email is unconfigured
      // (skipped) we leave the flag NULL so it fires once creds are set.
      if (result.ok) {
        await supabaseAdmin
          .from('policy_documents')
          .update({ [col]: new Date().toISOString() })
          .eq('policy_id', p.policy_id);
        sent++;
      }
    }

    if (sent) console.log(`[policy-expiry] Sent ${sent} expiry reminder(s)`);
  } catch (err) {
    console.error('[policy-expiry] Reminder error:', err.message);
  }
}
