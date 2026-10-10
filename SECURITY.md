# Security

Please report security issues privately through the repository owner's GitHub
profile before opening an issue containing exploit details or private records.
Do not attach credentials, participant exports, reset tokens, or pass QR codes.

This is a reusable starting point. Before operating a public event, configure
HTTPS, exact allowed origins, strong independent signing secrets, database
access controls and backups, a verified mail sender, and gateway webhooks.
Review privacy, retention, refund and event cancellation policies for your use.

An entry QR is a bearer credential: keep it private. The scanner requires staff
authorization and checks the current event/pass status before recording entry.
Payment success must be established by server verification, never by a client
claim. Duplicate callbacks must not create another receipt or pass.

Provider credentials belong only in the backend's ignored environment file or
your host's secret manager. Only the public Razorpay checkout key may be sent
to the browser. Rotate a secret immediately if it is accidentally published.
