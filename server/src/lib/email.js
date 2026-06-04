import nodemailer from 'nodemailer';

// Transactional email over SMTP (the same mail server configured for Supabase
// Auth emails), so policy reminders go out from noreply@cloudstory.ind.in.
//
// Configure in server/.env:
//   SMTP_HOST, SMTP_PORT (587 STARTTLS or 465 SSL), SMTP_USER, SMTP_PASS
//   SMTP_FROM (optional, defaults to noreply@cloudstory.ind.in)
// If SMTP is not configured the transporter is null and all helpers no-op
// (so local dev without creds doesn't crash).
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.SMTP_FROM || 'noreply@cloudstory.ind.in';

const transporter = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

/**
 * Low-level send. Returns { ok, id?, skipped?, error? } and never throws.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string }} opts
 */
export async function sendEmail({ to, subject, html, replyTo }) {
  if (!transporter) {
    console.warn('[email] SMTP not configured (SMTP_HOST/USER/PASS) — email skipped:', subject);
    return { ok: false, skipped: true };
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[email] No recipients — email skipped:', subject);
    return { ok: false, skipped: true };
  }
  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    return { ok: true, id: info?.messageId };
  } catch (err) {
    console.error('[email] send failed:', err?.message || err);
    return { ok: false, error: err };
  }
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(d);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Builds a deep link that the frontend reads on load to auto-open the policy.
 */
export function policyDeepLink(policyId) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '');
  return `${base}/?policyId=${encodeURIComponent(policyId)}`;
}

// Built-in default template (business-approved copy). Used when an org hasn't
// selected a custom "Policy expiry email template" in Settings. Supported
// placeholders: {{policyName}}, {{dueDate}}, {{policyLink}}.
export const DEFAULT_EXPIRY_TEMPLATE = {
  subject: 'Urgent: Information Security Policy Nearing Expiration',
  body:
    'Our {{policyName}} will expire on {{dueDate}}, presenting severe compliance and financial ' +
    'liability risks if left unaddressed. Failure to renew this policy on time will invalidate our ' +
    'cyber insurance and trigger automatic audit failures.\n\n' +
    'Please prioritize an immediate review and formal approval of the policy today to prevent ' +
    'operational disruption.\n\n{{policyLink}}',
};

/**
 * Substitutes {{policyName}}/{{dueDate}} in a plain-text field. Used for the
 * subject (no HTML).
 */
function applyTextVars(text, vars) {
  return String(text ?? '')
    .replaceAll('{{policyName}}', vars.policyName)
    .replaceAll('{{dueDate}}', vars.dueDate);
}

/**
 * Renders a template body into the branded HTML shell. Body is treated as
 * plain text (HTML-escaped); {{policyLink}} becomes a styled button (appended
 * at the end if the author didn't place the token); newlines become <br/>.
 */
function renderBodyHtml(body, vars, link) {
  const button = `<a class="cta" href="${link}">Review the policy</a>`;
  let safe = escapeHtml(body)
    .replaceAll('{{policyName}}', escapeHtml(vars.policyName))
    .replaceAll('{{dueDate}}', `<span class="due">${escapeHtml(vars.dueDate)}</span>`);
  if (safe.includes('{{policyLink}}')) {
    safe = safe.replaceAll('{{policyLink}}', button);
  } else {
    safe += `\n\n${button}`;
  }
  safe = safe.replace(/\n/g, '<br/>');
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }
    .body-text { font-size: 14px; line-height: 1.6; color: #1f2937; }
    .due { color: #dc2626; font-weight: bold; }
    .cta { display: inline-block; margin-top: 20px; background: #dc2626; color: #ffffff !important;
           text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: bold; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h2 style="margin: 0; color: #dc2626;">Urgent: Policy Nearing Expiration</h2></div>
    <div class="body-text">${safe}
      <p style="font-size:12px;color:#6b7280;margin-top:16px;">If the button does not work, paste this link into your browser:<br/>${link}</p>
    </div>
    <div class="footer">
      <p>This is an automated reminder from the Zero to Infinite &mdash; Unified Cyber Platform.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Renders + sends the escalating policy-expiry reminder. Uses the org's chosen
 * template when provided, else the built-in default.
 *
 * @param {{ recipients: string[], policyId: string, policyName: string, dueDate: string, window?: string, template?: {subject?: string, body?: string} }} opts
 */
export async function sendPolicyExpiryReminder({ recipients, policyId, policyName, dueDate, template }) {
  const link = policyDeepLink(policyId);
  const vars = {
    policyName: policyName || 'Information Security Policy',
    dueDate: fmtDate(dueDate),
  };
  const tpl = {
    subject: template?.subject?.trim() || DEFAULT_EXPIRY_TEMPLATE.subject,
    body: template?.body?.trim() || DEFAULT_EXPIRY_TEMPLATE.body,
  };
  const subject = applyTextVars(tpl.subject, vars);
  const html = renderBodyHtml(tpl.body, vars, link);
  return sendEmail({ to: recipients, subject, html });
}
