// Makes the sign-in email templates in this folder, in the same design as every other email the app sends
// (supabase/functions/_shared/email.ts). Run it after changing that design or the wording below:
//   node supabase/templates/build.mjs
// Then paste each file into Supabase: Authentication, Emails, Templates (see SETUP.md for which goes where).
// {{ .Token }} and the like are filled in by Supabase when it sends the email.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SITE = "https://ourfaithfulchurch.com/";
const here = new URL(".", import.meta.url).pathname;
const src = readFileSync(join(here, "../functions/_shared/email.ts"), "utf8").replace(/^import .*$/m, `const env = (k) => (k === "APP_URL" ? ${JSON.stringify(SITE)} : "");`);
const tmp = join(mkdtempSync(join(tmpdir(), "email-")), "email.mjs");
writeFileSync(tmp, stripTypeScriptTypes(src));
const { emailHtml, APP } = await import(tmp);

const ignore = "If you didn't ask for this, you can ignore this email. Nothing changes until the code is used.";
const TEMPLATES = {
  "confirm-signup.html": ["Confirm signup", `Your ${APP} code: {{ .Token }}`, {
    heading: "Welcome! Here's your code", preheader: "Enter this code in the app to finish creating your account.",
    paragraphs: ["Enter this code in the app to finish creating your account."], code: "{{ .Token }}",
    button: ["Or finish on this device", "{{ .ConfirmationURL }}"], footer: `The code works once and expires soon. It was asked for with {{ .Email }}. ${ignore}` }],
  "magic-link.html": ["Magic Link", `Your ${APP} code: {{ .Token }}`, {
    heading: "Your sign-in code", preheader: "Enter this code in the app to sign in.",
    paragraphs: ["Enter this code in the app to sign in."], code: "{{ .Token }}",
    button: ["Or sign in on this device", "{{ .ConfirmationURL }}"], footer: `The code works once and expires soon. It was asked for with {{ .Email }}. ${ignore}` }],
  "reset-password.html": ["Reset Password", `Reset your ${APP} password`, {
    heading: "Reset your password", preheader: "Enter this code in the app, then choose a new password.",
    paragraphs: ["Enter this code in the app, then choose a new password."], code: "{{ .Token }}",
    button: ["Or reset it on this device", "{{ .ConfirmationURL }}"], footer: `The code works once and expires soon. It was asked for with {{ .Email }}. If you didn't ask to reset your password, you can ignore this email: your password stays the same.` }],
  "change-email.html": ["Change Email Address", `Confirm your new email for ${APP}`, {
    heading: "Confirm your new email address", preheader: "One step left to change the email you sign in with.",
    paragraphs: ["You asked to change the email you sign in with from {{ .Email }} to {{ .NewEmail }}.", "Enter this code in the app to confirm it."], code: "{{ .Token }}",
    button: ["Or confirm on this device", "{{ .ConfirmationURL }}"], footer: "Until you confirm, you keep signing in with your current email. If you didn't ask for this, ignore this email and tell your church: someone may know your password." }],
  "invite.html": ["Invite user", `You're invited to ${APP}`, {
    heading: "You're invited", preheader: `Join your church on ${APP}.`,
    paragraphs: [`You've been invited to ${APP}, where your church shares sermons, events, giving, prayer, groups and more.`, "Tap the button to accept. You'll choose your name and a password next."],
    button: ["Accept the invitation", "{{ .ConfirmationURL }}"], footer: "The invitation was sent to {{ .Email }}. If you weren't expecting it, you can ignore this email." }],
  "reauthentication.html": ["Reauthentication", `Your ${APP} confirmation code: {{ .Token }}`, {
    heading: "Confirm it's you", preheader: "Enter this code in the app to finish changing your password.",
    paragraphs: ["Enter this code in the app to finish changing your password."], code: "{{ .Token }}",
    footer: "The code works once and expires soon. If you aren't changing your password, someone may be signed in as you: change your password and sign out of other devices." }],
};
for (const [file, [where, subject, m]] of Object.entries(TEMPLATES)) {
  writeFileSync(join(here, file), `<!-- Supabase: Authentication, Emails, Templates, "${where}".\n     Subject: ${subject}\n     Made by build.mjs: change it there, not here. -->\n${emailHtml(m)}\n`);
  console.log(file);
}
