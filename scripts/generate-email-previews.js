/* Safe previews of the actual renderer. No database, SMTP or credentials. */
const fs = require('node:fs');
const path = require('node:path');
process.env.FRONTEND_URL = 'https://events.example.com';
process.env.BRAND_NAME = 'EventFlow';
const { renderEmail } = require('../backend/src/services/email.service');
const samples = [
  ['account_created', 'Welcome to EventFlow', 'Your participant account is ready.\n\nBrowse events, join a team or manage your registrations from your dashboard.'],
  ['registration_created', 'Your event registration is recorded', 'Your registration for Community Workshop has been created.\n\nCheck your dashboard for its current status and any remaining requirements.'],
  ['payment_verified', 'Your payment has been verified', 'Payment for your Design Sprint registration has been verified successfully.\n\nYou can review the payment receipt and your registration status in your account.'],
  ['refund_requested', 'Your refund request has been received', 'The organizers have received your withdrawal and refund request.\n\nThey will review the request according to the event refund policy and update your account.'],
];
(async () => {
  const output = path.resolve(__dirname, '../docs/email-previews');
  fs.mkdirSync(output, { recursive: true });
  for (const [kind, subject, text] of samples) {
    const result = await renderEmail({ kind, subject, text, to: 'attendee@example.com', link: '/dashboard' });
    if (!result) throw new Error('Preview was unexpectedly suppressed');
    fs.writeFileSync(path.join(output, kind + '.html'), result.html);
    fs.writeFileSync(path.join(output, kind + '.txt'), result.text);
  }
  console.log('Generated four synthetic email previews without sending mail.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
