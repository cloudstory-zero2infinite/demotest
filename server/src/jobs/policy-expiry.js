import { supabaseAdmin } from '../supabase.js';

/**
 * Cron job: checks ALL orgs for expired approved policies and transitions them.
 * Runs independently of any user request context.
 */
export async function checkAllExpiredPolicies() {
  try {
    const now = new Date().toISOString().split('T')[0];

    const { data: expired } = await supabaseAdmin
      .from('policy_documents')
      .select('policy_id, name, user_id, org_id, policy_status')
      .in('policy_status', ['approved', 'reviewed'])
      .lt('refresh_date', now);

    if (!expired || expired.length === 0) return;

    for (const policy of expired) {
      const { count } = await supabaseAdmin
        .from('policy_documents')
        .update({ policy_status: 'to_review', updated_at: new Date().toISOString() })
        .eq('policy_id', policy.policy_id)
        .in('policy_status', ['approved', 'reviewed']); // idempotency guard

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
          message: `Policy "${policy.name}" has expired and moved to In Review`,
          from_status: policy.policy_status,
          to_status: 'to_review',
        },
      }).then(() => {});

      // Notification to policy creator
      if (policy.user_id) {
        supabaseAdmin.from('policy_notifications').insert({
          recipient_id: policy.user_id,
          policy_id: policy.policy_id,
          policy_name: policy.name,
          type: 'policy_expired',
          message: `Policy "${policy.name}" has expired and requires review`,
          org_id: policy.org_id,
        }).then(() => {});
      }
    }

    console.log(`[policy-expiry] Processed ${expired.length} expired policies`);
  } catch (err) {
    console.error('[policy-expiry] Error:', err.message);
  }
}