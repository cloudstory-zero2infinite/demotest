import { Router } from 'express';
import { Resend } from 'resend';

const router = Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'feedback@cloudstory.ind.in';
const TO_EMAIL = process.env.RESEND_TO_EMAIL || 'haripriya.kusnur@cloudstory.ind.in';

router.post('/email', async (req, res) => {
  try {
    if (!resend) {
      console.warn('Resend API key not configured. Feedback email skipped.');
      return res.status(200).json({ ok: true, message: 'Feedback received (email not configured)' });
    }

    const { rating, description, userId = 'Unknown', userEmail = 'Unknown' } = req.body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating (must be 1-5)' });
    }

    const escaped = (str) => (str || '(No description provided)').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
    .rating { font-size: 24px; color: #fbbf24; margin: 10px 0; }
    .section { margin: 15px 0; }
    .label { font-weight: bold; color: #1f2937; }
    .value { background: #f3f4f6; padding: 10px; border-radius: 5px; margin-top: 5px; }
    .feedback-text { white-space: pre-wrap; background: #f9fafb; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h2 style="margin: 0; color: #1f2937;">New Feedback Received</h2></div>
    <div class="section">
      <div class="label">Rating:</div>
      <div class="rating">${'⭐'.repeat(rating)} ${rating}/5 stars</div>
    </div>
    <div class="section">
      <div class="label">User Information:</div>
      <div class="value">
        <p><strong>User ID:</strong> ${escaped(userId)}</p>
        <p><strong>Email:</strong> ${escaped(userEmail)}</p>
        <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
      </div>
    </div>
    <div class="section">
      <div class="label">Feedback Description:</div>
      <div class="feedback-text">${escaped(description)}</div>
    </div>
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
      <p>This is an automated email from the Zeroto1 GRC feedback system.</p>
    </div>
  </div>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: userEmail,
      subject: `New Feedback Submission - Rating: ${rating}/5`,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Failed to send feedback email' });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('Feedback email error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

export const feedbackRouter = router;
