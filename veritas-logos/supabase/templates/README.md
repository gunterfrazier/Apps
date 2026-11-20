# Veritas Logos account emails

Supabase renders these templates and sends them through the project's existing Resend SMTP connection. Each template uses the turned-leaf app icon, the Veritas Logos wordmark, and the blue and silver palette from the app.

| Supabase template | Subject | HTML body |
| --- | --- | --- |
| Confirm signup | Confirm your Veritas Logos email | [confirmation.html](confirmation.html) |
| Magic link or OTP | Your Veritas Logos sign-in code | [magic-link.html](magic-link.html) |
| Reset password | Reset your Veritas Logos password | [recovery.html](recovery.html) |

In the Veritas Logos Supabase project, open **Authentication → Emails → Templates**. Copy the subject and the entire HTML file into the corresponding template and save. The Supabase dashboard is where the hosted templates are configured. The repository files are the reviewable copies.

Each body has one `{{ .Token }}`, which Supabase replaces with the one-time code. Readers can select and copy that code, then use **Paste code** on the account screen that requested it. Native paste, supported autofill, and manual entry also work. Use a dummy code like `482619` for visual previews. Codes stay out of the subject and inbox preview text. If a mail client blocks remote images, the brand name, instructions, and code are still text.

After installing, use a test account to confirm signup, sign in with an email code, and reset a password from the app. Check the actual messages on a phone, including dark mode. The inline colors provide the light layout when a client ignores the dark-mode stylesheet.

[Supabase email template documentation](https://supabase.com/docs/guides/auth/auth-email-templates)
