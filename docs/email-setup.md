# Configure transactional email

The application stores an email job when an account or event workflow needs a
message. The request attempts prompt delivery after its database transaction
commits; the worker retries unsent jobs independently. Configure a worker even
when request-time delivery is enabled. Provider throttling or inbox filtering
can still delay messages; this template makes no one-minute delivery promise.

Use a transactional SMTP provider and a verified domain for public deployment.
Keep one consistent sender identity and set a monitored reply-to address.
Never rotate accounts to evade a provider's sending limits.

## Values to collect in one pass

Set these **backend** environment variables using the provider dashboard:

```dotenv
EMAIL_PROVIDER=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
EMAIL_FROM_ADDRESS=
EMAIL_REPLY_TO=
BRAND_NAME=EventFlow
FRONTEND_URL=https://events.example.com
```

Use the host, TLS port and credentials your provider documents. Port 465 uses
implicit TLS; ports 587 and 2525 require STARTTLS. API tokens often serve as
SMTP passwords, but they are not interchangeable across providers.

Authenticate the sender domain in the provider dashboard. Add the supplied SPF
and DKIM records to your DNS, and configure DMARC with a policy appropriate for
your domain. Copy the provider's actual records rather than examples in a blog.
Verify the public frontend URL before sending links. Passwords and tokens belong
in an ignored environment file or host secret manager, never in the frontend.

## Provider choices

The generic SMTP adapter can use any of the following services after you obtain
its real email-delivery SMTP credentials. Plans, quotas and eligibility change;
check current terms in each official dashboard before choosing a service.

| Service | What to collect / enable |
| --- | --- |
| [Mailtrap](https://docs.mailtrap.io/) | Email **Delivery** SMTP host, username, password and verified sender; its Sandbox captures tests rather than delivering to users. |
| [Brevo](https://developers.brevo.com/docs/smtp-integration) | SMTP relay host, SMTP login and SMTP key, authenticated sender. |
| [Gmail](https://support.google.com/accounts/answer/185833) | Approved mailbox SMTP credentials; an App Password when supported by account policy. Appropriate quotas apply. |
| [SendGrid](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/integrating-with-the-smtp-api) | SMTP host, provider-required username, API key as password, sender authentication. |
| [Mailgun](https://documentation.mailgun.com/) | Domain-specific SMTP login/password and correct region's SMTP host. |
| [Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html) | Region-specific SMTP endpoint and SMTP credentials; these differ from AWS access keys. Request production access when necessary. |
| [Postmark](https://postmarkapp.com/developer/user-guide/send-email-with-api/send-an-email) | Transactional server SMTP credentials and verified sender. |
| [Mailchimp Transactional](https://mailchimp.com/developer/transactional/docs/smtp-integration/) | Transactional SMTP configuration and account eligibility. |
| [SMTP2GO](https://www.smtp2go.com/setupguide/) | SMTP username/password, relay endpoint and verified sender. |
| [Mailjet](https://dev.mailjet.com/smtp-relay/overview/) | SMTP endpoint, API key/secret pair for authentication and verified domain. |
| [MailerSend](https://www.mailersend.com/help/smtp-relay) | Domain SMTP user/password, relay endpoint and verified domain. |

Switching provider normally changes environment values, not registration logic
or the email templates. Send a test to a mailbox you own, inspect provider logs,
and check both the HTML and plain-text versions before inviting participants.

## Workflow messages

Professional responsive HTML and plain text communicate why the recipient is
receiving the message and what to do next. The retained flows cover team
invitations and responses, registration confirmation, payment submission/review
or gateway receipt, required-document updates, individual passes, password
reset, withdrawal/refund decisions and event reminders.

Entry-pass emails belong to individual accepted teammates. Role-sensitive
messages recheck the recipient's current event access before delivery. Retries
reuse a deduplication key; they must not create another payment receipt or pass.

Disable external mail for local exploration until you have configured your own
test sender. Run the automated mail tests against their disposable SMTP sink;
never copy a live event's Gmail accounts or queued messages into this project.
