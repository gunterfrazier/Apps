# Setting up Our Faithful Church App for real churches

The preview keeps everything in one browser. This guide connects the app to the services that let real people share data, sign in, give money and get notifications. Do the steps in order. Steps 1 to 5 give you a working shared app; the rest add payments, push notifications, AI drafts, schedules and text-to-give, and can come later.

You'll need about two hours, a GitHub account (you have one), and a free Supabase account. Each church brings its own Stripe, PayPal or Square account.

| Service | What it does here | Cost to start (check current prices) |
| --- | --- | --- |
| GitHub Pages | Hosts the app's files | Free |
| Supabase | Database, sign-in, file storage, live updates, server functions | Free tier; Pro is $25 a month when you outgrow it |
| Stripe, PayPal or Square (each church picks) | Gifts, tickets and form fees, straight to each church's account | No monthly fee; each processor charges per payment (see their pricing pages) |
| Anthropic API | AI drafts for teachers | Pay per use; a draft costs about a cent |
| Twilio (optional) | Text-to-give number | About $1.15 a month per number plus a cent per text |

Nothing here costs money until a church starts taking payments or you pass the free tiers.

---

## 1. Put the app online

The app is a folder of plain files (`church-platform/dist/`: the website at its root and the app in `dist/app/`), so any static host works. These steps use GitHub Pages because the code is already on GitHub.

1. Merge the `claude/church-platform` branch into `main` when you're ready (a pull request on GitHub is easiest).
2. In the repository on GitHub, open **Settings, Pages**, and under **Build and deployment, Source** choose **GitHub Actions** (not "Deploy from a branch": that publishes the source files, not the built app).
   Then open **Settings, Environments, github-pages**. Under **Deployment branches and tags**, make sure `main` is allowed: choose **No restriction**, or keep **Selected branches and tags** and add `main`. If only `claude/church-platform` is listed, publishing fails with "Invalid deployment branch".
3. Open the **Actions** tab, choose **Publish Our Faithful Church App**, and select **Run workflow**. It builds the app and publishes it.
4. When it finishes, the address is shown on the run (something like `https://gunterfrazier.github.io/Apps/`). Write it down. This guide calls it **your app address**.

At this point the app runs on its own site, still in browser-only mode. Install it on a phone to check: in Chrome choose **Install app**; on iPhone, Safari's **Share, Add to Home Screen**.

> **Our Faithful Church App now has its own domain, `https://ourfaithfulchurch.com/`, hosted on Cloudflare.** See [Your own domain on Cloudflare](#your-own-domain-on-cloudflare) below; that address is the app address from here on. The GitHub Pages address keeps working and forwards there.

## 2. Create the database

1. Sign up at [supabase.com](https://supabase.com) and create a project. Pick the region nearest your churches and save the database password somewhere safe.
2. Open **SQL Editor**, paste all of `church-platform/supabase/schema.sql`, and select **Run**. It creates the tables, the security rules and a public `media` bucket for logos and sermon audio.
   Already ran an earlier `schema.sql` (version 3)? Run `church-platform/supabase/upgrade-4.sql` once instead. It updates the security rules for digital signage and church devices and leaves your data alone.
3. Your project's address and **publishable key** (`sb_publishable_...`, under **Project Settings, API Keys**) are already in `public/config.js` for the project `iigterjskwnqmnoysbha`. If you ever make a new project, change them there.

The publishable key is safe to publish: it can only do what the security rules allow for each signed-in person. The **secret** key (`sb_secret_...`) and the database password are different: never put them in the app, in GitHub, or in a chat. The server functions get the secret key from Supabase on their own.

> Supabase's **Connect** panel shows setup steps for frameworks like Next.js (`npm install @supabase/ssr`, `.env.local`, middleware). Skip those: Our Faithful Church App is a plain web app that loads Supabase in the browser, so it only needs the address and publishable key.

## 3. Turn on sign-in by email

The sign-in screen asks whether someone is new or already has an account. A new person enters their email, types the code from the email to confirm it, then gives their name and chooses a password. After that they sign in with their email and password. **Forgot your password?** and **Email me a code instead** both send a code, so nobody gets locked out.

1. **Authentication, Sign In / Providers, Email**: keep Email on, **Confirm email** on and **Allow new users to sign up** on. The app asks for passwords of at least 8 characters, so leave Supabase's minimum at 8 or lower. If **Secure password change** is on, the app asks for one more emailed code when someone changes a password long after signing in.
2. **Authentication, URL Configuration**:
   - **Site URL**: your app address, `https://ourfaithfulchurch.com/`.
   - **Redirect URLs**: add the same address with `**` on the end, `https://ourfaithfulchurch.com/**`. Keep `https://gunterfrazier.github.io/Apps/**` listed too while the old address is still in use.
   Without these, the link in the email goes to `localhost` and doesn't open. With them, signing in by link works right away.
3. **Connect an email sender** under **Authentication, Emails, SMTP Settings**. Supabase's built-in email only delivers to the people on your Supabase team, a few an hour, so the congregation can't sign in until this is done. Free projects created since June 2026 also can't change the email wording until it's done. Any SMTP service works:
   - With your church's own web domain: Resend, Postmark, Brevo or SendGrid (each has a free tier). Add the DNS records they give you so mail isn't marked as spam.
   - Without a domain: a Gmail account for the church, with 2-step verification on and an app password. Host `smtp.gmail.com`, port `465`, the Gmail address as user and sender, the app password as password. Gmail allows about 500 emails a day.
4. **Use the app's own email designs** (once step 3 is done), under **Authentication, Emails, Templates**. Each template has a file in `church-platform/supabase/templates`, in the same design as every other email the app sends. For each one, paste the subject from the top of the file, and the whole file as the message body:
   | Template in Supabase | File | Sent when |
   |---|---|---|
   | Confirm signup | `confirm-signup.html` | Someone signs in for the first time |
   | Magic Link | `magic-link.html` | Someone asks for a sign-in code (and Forgot your password?) |
   | Reset Password | `reset-password.html` | A password reset is asked for |
   | Change Email Address | `change-email.html` | Someone changes the email they sign in with |
   | Invite user | `invite.html` | You invite someone from the Supabase dashboard |
   | Reauthentication | `reauthentication.html` | Someone changes their password with Secure password change on |

   The first two matter most; the others make sure nothing still looks like Supabase. To change the wording or the design, edit `supabase/templates/build.mjs` or `supabase/functions/_shared/email.ts`, run `node supabase/templates/build.mjs`, and paste them again.

To check it: in the app, enter your email. The email that arrives should have the link, and after step 4 the code too. A link or code from an older email stops working once a newer one is sent.

## 4. Point the app at the database

This is already done: `public/config.js` names your project, and the build puts it next to the app. Run **Publish Our Faithful Church App** again after step 2 so the published site picks it up.

To use a different project without changing the code, add repository variables on GitHub under **Settings, Secrets and variables, Actions, Variables**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL` (your app address, ending in `/app/`) and later `VAPID_PUBLIC_KEY`. When `SUPABASE_URL` is set, the workflow writes those into `config.js` instead. (Hosting somewhere else? Upload `config.js` with the rest of the `dist` folder.)

Open your app address. You should now see **I have an account** and **I'm new here** instead of the preview's welcome screen.

## 5. Register the first church

1. Choose **I'm new here**, enter your email and the code from the email, then your name and a password. (An account made before passwords were added is asked for a name and password once, the next time it opens the app.)
2. Choose **Register a church** and fill in the form manually, or select **Use setup wizard** to go through church details, campuses, feature choices and a checklist. You're the new church's primary account holder.
3. Open **Admin**, then **Setup wizard and checklist** to track each step and find links to the relevant settings. Open the printable checklist to print, save a PDF through your browser, or download an HTML copy. You can return to the wizard whenever you add a feature. **Features and defaults** also supports manual setup.
4. Invite people with **Home, Invite a friend** or a QR code (**Ministry tools, QR codes, Join the church**). Everyone who joins starts with the default role you chose under **Features and defaults**.

From here the app is shared: sign-ups, prayer requests, chats, check-ins and everything else sync between people, and changes show up for others within a second or two.

> Data from the preview doesn't move over. Sample churches only exist in the preview.

## 6. Take real gifts, tickets and form fees (Stripe, PayPal or Square)

Each church chooses its own payment processor in the app, under **Admin, Giving, Online payments**, and pastes its keys there. Money goes straight into the church's own Stripe, PayPal or Square account; the app never holds it.

| Processor | What givers can use | Recurring gifts | The church needs |
|---|---|---|---|
| Stripe | Cards, Apple Pay, Google Pay, US bank accounts | Weekly and monthly | Its Stripe **secret key** (Developers, API keys) |
| PayPal | PayPal, Pay Later, cards | Weekly and monthly | A **Client ID** and **Secret** from an app at developer.paypal.com |
| Square | Cards, Apple Pay, Google Pay | Not yet | An **access token** from an app at developer.squareup.com |

The app shows these steps next to each choice. When a church connects, the app checks the keys with the processor, sets up the processor's payment notices (a webhook) by itself, and stores the keys encrypted in Supabase Vault, where only the server functions can read them. Test keys (Stripe test mode, PayPal sandbox, Square sandbox) work too, and the app marks the church as **Test mode** until live keys are connected.

A church that already gives through Tithe.ly, Pushpay, Givelify, Planning Center, Subsplash, Vanco or another service can link its giving page under **Admin, Giving, Another giving service**. The Give screen then leads with that link. Gifts made there stay in that service, so they don't show in the app's reports or statements.

**Do this once for the whole app.** Run `supabase/upgrade-5.sql` in the SQL editor if you set up the database before this version (new projects get it from `schema.sql`). Then install the [Supabase CLI](https://supabase.com/docs/guides/cli) and, from the `church-platform` folder:

```bash
supabase login
supabase link --project-ref iigterjskwnqmnoysbha
supabase secrets set APP_URL=https://YOUR-APP-ADDRESS/
supabase functions deploy payments-setup
supabase functions deploy checkout
supabase functions deploy pay-confirm
supabase functions deploy pay-webhook
supabase functions deploy refund
supabase functions deploy recurring
```

No Stripe, PayPal or Square keys of your own are needed for this: each church brings its own.

`supabase/config.toml` turns off the platform's own token check, which doesn't work with publishable and secret keys. Each function checks its caller itself: signed-in people through Supabase Auth, the processors and Twilio by their signatures, the database webhook and the schedules by a shared secret.

**Test it** with a church connected in test mode. With Stripe, use card `4242 4242 4242 4242`, any future date and any CVC; with PayPal, a sandbox buyer account from developer.paypal.com; with Square, the sandbox test card `4111 1111 1111 1111`. Check that the gift appears under **Giving history** and **Admin, Giving**. Then try a recurring gift (Stripe or PayPal), a ticket and its refund.

**Go live:** each church connects its live keys under **Admin, Giving, Update keys**.

**Optional: Stripe Connect.** If you'd rather churches sign up for Stripe through your own platform account (with no keys to copy, and an optional platform fee), set that up too: in Stripe, open **Connect** and finish the platform setup with **Standard** accounts; add a webhook at `https://iigterjskwnqmnoysbha.supabase.co/functions/v1/stripe-webhook` that listens to events on connected accounts (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `account.updated`); then run `supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_... PLATFORM_FEE_PERCENT=0` and deploy `stripe-connect` and `stripe-webhook`. The Stripe choice in the app then also offers **Sign up through Stripe instead**.

Year-end statements need nothing extra: members download a PDF under **Giving history**, and staff download every giver's statement in one PDF under **Admin, Giving**. Add the church's EIN there so it prints on statements.

## 7. Push notifications

1. Deploy the function: `supabase functions deploy push`
2. Open `supabase/push.sql`, replace `YOUR-PROJECT` with `iigterjskwnqmnoysbha`, and run it in the SQL editor.

That's all. The push function makes its own key pair the first time it runs and keeps it in Supabase Vault, and the app asks it for the public key. The password the database sends it with each notification is made by `push.sql` and kept in Vault too, so there's nothing to generate, paste or set as a secret, and no Database Webhook to create. (Keys set the older way, as `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `PUSH_HOOK_SECRET` secrets with `vapidPublicKey` in `config.js`, still work and take priority.)

People turn push on under **Me, Settings**. On iPhone, push works only after the app is added to the Home Screen (iOS 16.4 and later).

## 8. AI drafts for teachers

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... AI_DAILY_LIMIT=40
supabase functions deploy ai
```

Get the key at [console.anthropic.com](https://console.anthropic.com). Only people whose role lets them build sermons, lessons or studies, or lead groups or classes, can use AI drafts, up to the daily limit each. Set `ANTHROPIC_MODEL` to choose a different Claude model.

## 9. Schedules: webhooks and reminders

```bash
supabase functions deploy webhooks
supabase functions deploy reminders
```

Pick a long random password for the schedules and give it to the functions:

```bash
supabase secrets set CRON_SECRET=any-long-random-text
```

Then open `supabase/cron.sql`, replace `YOUR-PROJECT` with `iigterjskwnqmnoysbha` and `PASTE-THE-SAME-RANDOM-TEXT` with that password, and run it in the SQL editor. It sends queued webhook messages every minute and adds day-before reminders every hour. The password lives in Supabase Vault, not in the app.

## 10. Podcast feed

```bash
supabase functions deploy podcast
```

Under **Admin, Sermons, Podcast feed**, fill in the show details and cover art, then **Copy feed address** and submit it once to [Apple Podcasts Connect](https://podcastsconnect.apple.com) and [Spotify for Podcasters](https://podcasters.spotify.com). New sermons with an audio file appear on their own. With Supabase connected, staff can upload sermon audio and video straight from **Media and transcript**.

## 11. Text to give (optional)

1. Buy a number at [twilio.com](https://twilio.com) (US numbers need A2P 10DLC registration for texting, which Twilio walks you through).
2. Deploy and set the secrets:
   ```bash
   supabase secrets set TWILIO_AUTH_TOKEN=... SMS_PUBLIC_URL=https://iigterjskwnqmnoysbha.supabase.co/functions/v1/sms
   supabase functions deploy sms
   ```
3. In Twilio, set the number's **A message comes in** webhook to the same `SMS_PUBLIC_URL` (HTTP POST).
4. In the app, **Admin, Giving**: enter the number and a keyword. People text `GIVE 50` and get a link to finish the gift. One number can serve one church.

## 12. Church devices: kiosks, signage and screens

Kiosks, lobby screens, presentation, classroom and stage screens and the booth computer sign in as devices, with their own accounts, so nobody leaves a staff login on a shared screen.

```bash
supabase functions deploy device-pair
```

1. In the app, **Admin, Screens and devices, Add a device**. Choose what it does, its location, and an exit code if you want one. You get a 6-character code that lasts 30 minutes.
2. On the device, open the app and choose **Set up a church device** (under the sign-in box), or scan the QR code next to the code. Enter the code. The device signs in and goes straight to its screen.
3. To sign a device out, open it in **Screens and devices** and choose **Remove device**. Its account is deleted and the screen goes back to sign-in.

**If a code "didn't work":** make the code while signed in to your church on this website, not in the demo, in training or in a preview. Those keep everything in the one browser, so their codes (marked "practice code") mean nothing to another device. Codes last 30 minutes; **New code** on the device's row makes a fresh one. The app shows a code only after the server has saved the device, and says so if it couldn't.

A device is paired once. It keeps its own sign-in and signs itself back in after a restart, a power cut, a long time offline or lost browser storage, so nobody types a code again. On an iPad, add the app to the Home Screen and pair it from there: Safari can clear a website's storage after a week without use, but not a Home Screen app's.

Each device gets only what its job needs: a kiosk can check kids in, presentation and stage screens and the booth can present, and a signage screen can only read its church's playlists and public information. Device accounts don't appear in the member directory or the people list. Codes are single-use and expire; a wrong code is refused after a short pause.

For signage, make a playlist under **Admin, Digital signage** first, then add a **Signage screen** device that plays it.

**Approvals** (pre-approved volunteers, and requests that wait for approval) need `supabase/upgrade-8.sql` (new projects get it from `schema.sql`). Run it after `upgrade-7.sql`.

**Rooms and room displays** need `supabase/upgrade-7.sql` (new projects get it from `schema.sql`) and the latest `device-pair`. Under **Screens and devices, Rooms**, give each room its number and where it is, then **Add a display** to the rooms with a TV or projector. Choose what it shows when no one is presenting: a signage playlist, or whatever the main screens show. A teacher whose class meets in the room, or someone with an approved booking, can present to it from their phone from 15 minutes before their time until it ends: they scan the QR code on the screen, or use **Present** on their class page or on the Rooms screen. Administrators, pastors, ministry staff and media coordinators also get **Present on any room's display, at any time**; turn it on for other roles under **Roles and permissions**. A room display can read bookings and presentations in rooms, and only the person presenting can start or change their own presentation.

## 13. Deactivating a church account

A church's primary account holder can deactivate its account under **Admin, Deactivate church account**. An administrator can ask to, if the primary has ticked **Ask to deactivate the church account** for their role under **Roles and permissions** (nobody has it to start with, and only the primary can give it). The primary then approves or declines.

Before it happens the app shows what it means and makes the person type the church's name and tick a box. Once deactivated:

- The church is hidden from everyone but the primary account holder, and it's out of the list of churches. Its public page, links and embedded pages stop, online giving stops (recurring gifts are stopped with the processor), and its screens and kiosks are signed out.
- The primary can reactivate it for **one year**. Everything comes back as it was; recurring gifts are set up again by the givers, and screens are paired again.
- After a year, everything in the account is permanently deleted from the server: its records, members, roles, locations, payment records, device sign-ins and uploaded files. People's own sign-ins stay, since they may belong to other churches.
- The primary is reminded by email and in the app with 180, 90, 30, 14, 7, 3 and 1 days left, each time with a way to reactivate.

To set it up:

1. **Database.** A database from before version 9 needs `supabase/upgrade-9.sql` (run it after `upgrade-8.sql`; new projects get it from `schema.sql`).
2. **Server function.**
   ```bash
   supabase functions deploy church-lifecycle
   supabase functions deploy checkout
   ```
3. **Hourly job.** Open `supabase/cron-lifecycle.sql`, replace `YOUR-PROJECT` with `iigterjskwnqmnoysbha`, and run it in the SQL editor. This is what sends reminders and deletes data when the year is up. It needs no password of its own.
4. **Email.** Reminders in the app work without this. For the emails, give the functions a sender. Either the mailbox you already use for sign-in emails:
   ```bash
   supabase secrets set SMTP_HOST=smtp.gmail.com SMTP_USER=you@gmail.com SMTP_PASS=your-app-password
   supabase secrets set EMAIL_FROM="Our Faithful Church App <you@gmail.com>"
   ```
   or an email service: `supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Our Faithful Church App <hello@ourfaithfulchurch.com>"`. You can also add these under **Edge Functions, Secrets** in the dashboard. Emails go to the address the primary account holder signs in with.
5. **Links in the emails** use the `APP_URL` secret (`https://ourfaithfulchurch.com/`).

The deactivation record itself can't be changed by a browser, or by another server function saving the church's settings: only `church_deactivation()` changes it. To correct one by hand in the SQL editor, first run `select set_config('our_faithful.lifecycle', '1', false);`.


## 14. Attendance, dates, campaigns, the activity log and group email

1. **Database.** A database from before version 10 needs `supabase/upgrade-10.sql` (run it after `upgrade-9.sql`; new projects get it from `schema.sql`). Until then the app works as before and these features stay empty.
   Custom reports need version 11: run `supabase/upgrade-11.sql` after `upgrade-10.sql`. Until then custom reports and their saved copies stay on the device that made them.
   Ticket payments in cash and by check need version 12: run `supabase/upgrade-12.sql` after `upgrade-11.sql`.
   Event check-in by ticket, entry devices and payment kiosks need version 13: run `supabase/upgrade-13.sql` after `upgrade-12.sql`, and deploy `kiosk`, `texting`, `sms`, `qz-sign`, `ticket-receipt`, `reminders` and every function that uses `_shared/settle.ts` (`checkout`, `pay-webhook`, `stripe-webhook`, `pay-confirm`, `refund`). Texting uses each church's own Twilio account, linked under Admin, Texting; the server's own `TWILIO_*` secrets are no longer needed. Card readers (Stripe Terminal or Square Terminal) are paired under Admin, Card readers. Kiosks choose a printer for each job through QZ Tray (qz.io) on the kiosk computer; see Admin, Printing.
   Sheet music on stage displays needs version 14 so people who plan services can upload it: run `supabase/upgrade-14.sql` after `upgrade-13.sql`. PDFs are split into pages in the browser with pdf.js (`public/vendor/pdfjs`), so no server function is needed.
   Community boards, targeted push, arrival check-in, the treasurer's ledger, volunteer sub claiming and campus safety need version 15: run `supabase/upgrade-15.sql` after `upgrade-14.sql`. It adds a Security team permission (given to Administrator, Pastor and Staff); give it to other roles, or put people on a team named Security, Safety, Medical, First aid, Greeters or Ushers, so they get SOS and 911 alerts.
   Before deploying the Security Command roles and approvals UI to an existing project, run `supabase/upgrade-16.sql` after version 15. New projects receive the same rules through `supabase/schema.sql`. In **Security Command → Access & approvals**, a church administrator can assign heads of security, supervisors and volunteers. Existing Security Team access continues to allow communications. Assign supervisors a direct declaration limit or require approval at every level. Reviewers receive an in-app alert for each pending request.
   For incident triage and the response timeline, run `supabase/upgrade-17.sql` after version 16. Incident updates and clear confirmations are stored as separate entries so simultaneous responders can log updates without replacing each other’s work.
   For assignable accident and incident reports, run `supabase/upgrade-18.sql` after version 17. Heads of security and church administrators can customize forms under **Security Command → Incidents → Report forms**. Reports are created from an incident and retain the questions from the form used at creation.
   To require explicit Security Command assignments, run `supabase/upgrade-19.sql` after version 18 before deploying the role defaults UI. General church roles and team names no longer grant operational access. Church administrators can use **Security Command → Access & approvals → Assign access** to enroll staff, including themselves, and **Roles** to set each role's default declaration level. The built-in defaults are Volunteer 1, Security staff 2, Supervisor 4, and Head of security 5. Administrators can still manage assignments, review requests and issue All Clear without an operational assignment. Existing explicit roles and individual supervisor limits are preserved. Check that current responders have explicit assignments before relying on the new defaults during a service.
   If an earlier attempt to apply version 19 reported an existing policy, run the complete updated `upgrade-19.sql` again. It replaces the version 19 policies atomically and preserves saved role defaults and assignments.
   The media library (Admin, Media library, and **Find media** next to every picture) needs version 20: run `supabase/upgrade-20.sql` after version 19. Until then, pictures picked with Find media still save where they're used; they just aren't kept in the library. Searching Openverse needs nothing else. To also search Pexels and Pixabay (photos and worship background videos), a church admin pastes the church's own free API keys under Admin, Media library.
2. **Group email.** Deploy the `send-email` function. It uses the same email secrets as step 13 (`RESEND_API_KEY` and `EMAIL_FROM`, or the `SMTP_*` ones). With Resend, `EMAIL_FROM` must be an address on a domain you've verified there. Who may send is the **Email groups of people** permission under Admin, Roles (pastors and staff by default). Each church can send 5 group emails an hour, to at most 500 people each. Members can email other members listed in the directory (from Connect, Email): up to 5 people per message and 10 messages an hour each.

   **Sending as each person.** With Resend, email someone sends from the app comes from their own name, like `"Wes Parker" <wesparker@mail.ourfaithfulchurch.com>`, with replies going to their real address. The domain is `EMAIL_PERSONAL_DOMAIN` if you set it (`supabase secrets set EMAIL_PERSONAL_DOMAIN=mail.ourfaithfulchurch.com`), otherwise the domain of `EMAIL_FROM`. It must be verified in Resend. Set `emailDomain` in `public/config.js` to the same domain so the app shows people their address. Sign-in emails still come from `EMAIL_FROM`. With an SMTP mailbox, everything comes from `EMAIL_FROM`.
3. **Media on a display.** Nothing to set up. A file from a phone goes straight to the display (up to about 6 MB); people who may upload content have it stored instead, so longer videos work. Some websites refuse to be shown inside another page; nothing can change that from here.
4. **Security Command radio.** Run `supabase/upgrade-21.sql` before deploying the radio. It requires version 19. If you are adding the media library in the same rollout, run its version 20 migration first. On each phone, sign in with explicit Security Command access and tap **Enable radio** to hear transmissions. Allow microphone access the first time you hold **Hold to talk**. Keep the app in the foreground and connected to the internet. A transmission can last up to 30 seconds. Use **Message** to send a saved message that can be opened or replied to later.

## 14. Check that everything works

- [ ] Two people on different phones join the same church and see each other's prayer requests and chat messages.
- [ ] A member can't open **Admin**, and a teacher sees only their own classes in the lesson builder.
- [ ] A test gift shows in the giver's history and in **Admin, Giving**; a refunded ticket shows as refunded.
- [ ] Turning on push and posting an announcement with **Also send it as a notification** reaches a phone with the app closed.
- [ ] A webhook pointed at [webhook.site](https://webhook.site) receives `member.joined` with a valid signature.
- [ ] The kiosk finds a family and prints a name tag on your label printer.
- [ ] A room display shows its playlist and QR code; a teacher scans it during their class, presents a lesson, and the display goes back to its playlist when they stop.
- [ ] Unplug a paired screen for a minute and plug it back in: it comes back on its own screen without a code.
- [ ] A paired presentation screen on another computer shows the booth's slides as you move through them, and goes back to its logo or playlist when you close the presenter.

## Your own domain on Cloudflare

The app's one address is `https://ourfaithfulchurch.com/`. Cloudflare Pages builds it from this repository, the way it hosts Veritas Logos. Only the website moves: the database, sign-in and server functions stay on Supabase.

Sign-ins, the home-screen install, notification permission and paired screens belong to the address they were made at, so everyone starts fresh at the new address. Do this move before churches join.

1. **Add the domain to Cloudflare.** In the Cloudflare dashboard, add `ourfaithfulchurch.com` as a domain on the Free plan. Cloudflare shows two nameservers (names ending in `.ns.cloudflare.com`). A root domain like this one has to use Cloudflare's nameservers to work with Pages.
2. **Point the domain at Cloudflare.** At GoDaddy: **Domain Portfolio**, choose the domain, **DNS**, **Nameservers**, **Change Nameservers**, **I'll use my own nameservers**. Enter the two from Cloudflare, **Save**, **Continue**. Cloudflare emails you when the domain is active, usually within an hour and sometimes up to two days. The domain stays registered at GoDaddy.
3. **Create the Pages project.** Under **Workers & Pages**, create a **Pages** project connected to Git, and pick this repository (`gunterfrazier/Apps`):
   - Production branch: `main`
   - Framework preset: none
   - Build command: `cd church-platform && node build.mjs`
   - Build output directory: `church-platform/dist`
   - Root directory: leave empty. The build also reads the Bible text in `veritas-logos/`.
   Deploy, then open the `pages.dev` address it gives you. You should see the app's sign-in screen.
4. **Attach the domain.** In the project, **Custom domains**, **Set up a domain**: `ourfaithfulchurch.com`. Do it again for `www.ourfaithfulchurch.com`. The app sends anyone who opens the `www` name to the main address.
5. **Tell Supabase the new address.**
   - **Authentication, URL Configuration**: set **Site URL** to `https://ourfaithfulchurch.com/` and add `https://ourfaithfulchurch.com/**` to **Redirect URLs**. Until this is done, the link in a sign-in email opens the old address.
   - **Edge Functions, Secrets**: set `APP_URL` to `https://ourfaithfulchurch.com/`. Notifications, the podcast feed and text-to-give use it for their links.
6. **Check it.** Open `https://ourfaithfulchurch.com/`, sign in, and install it to your home screen. Then open the old address: it forwards to the new one.

How the forwarding works: `public/config.js` names the new address (`home`) and the old host (`movedFrom`). The old site checks that the new one is really serving the app before it sends anyone there, so nothing changes for people until steps 1 to 4 are finished. To keep using the old address, add `?stay` to it.

Good to know:

- **Try changes before merging.** Cloudflare builds every branch and pull request at its own preview address (shown on the pull request and in the project's **Deployments**). A preview uses the real database, so test with care. To sign in there with an emailed link, add `https://*.YOUR-PROJECT.pages.dev/**` to Supabase's Redirect URLs; typing the code from the email works without that.
- **Fewer builds.** Each push builds this project and Veritas Logos. Under the project's **Settings, Builds**, set build watch paths to `church-platform/*` and `veritas-logos/public/data/bible/*` so it only builds when the app changes.
- **If a build fails** on the Node version, add the environment variable `NODE_VERSION` = `22` under **Settings, Variables and Secrets**.
- **Sign-in email from your own domain.** Step 3.3 can now use a sender at `ourfaithfulchurch.com` (Resend, Postmark, Brevo or SendGrid) instead of the Gmail account. Add the DNS records they give you in Cloudflare.

## Deploying the server functions from GitHub

The **Deploy Supabase functions** workflow (`.github/workflows/supabase-functions.yml`) keeps the server's edge
functions the same as main. Each time main changes a function, it redeploys that function, and a change to a file in
`_shared` redeploys every function that uses it. It only redeploys functions already on the project; to add a new one,
run the workflow by hand with its name. Database changes (`upgrade-N.sql`) still go through the SQL editor.

Set it up once:

1. In Supabase, open your account menu, then **Account preferences, Access Tokens**, and generate a token. Name it
   something like "GitHub deploys".
2. In GitHub, open the repository's **Settings, Secrets and variables, Actions**, and add a repository secret named
   `SUPABASE_ACCESS_TOKEN` with the token.
3. The project's ID is read from `public/config.js`. To deploy somewhere else, add a variable `SUPABASE_PROJECT_REF`.
4. To deploy now, open **Actions, Deploy Supabase functions, Run workflow**. Leave "all" to redeploy every function
   that's on the project, or name some (`push kiosk`).

Without the secret, the workflow skips deploying and leaves a note on the run.

## Time zones (version 27)

For an existing project, run `supabase/upgrade-27.sql` after version 26, then deploy the edge functions again
(`reminders`, `kiosk`, `ticket-receipt`, `push`, `church-lifecycle`, and the ones that use `_shared/settle.ts`).
The **Deploy Supabase functions** workflow does that: run it with "all".

- Each church sets its time zone under **Admin, Account details**. A campus in another zone sets its own under
  **Admin, Locations**. New churches start with the zone of the phone or computer that registered them.
- Churches that registered before this have no zone yet. Until someone sets one, the app shows times in each phone's
  own zone, as before, and the server uses Eastern time. Their **Dashboard** lists "Set the church's time zone"
  under Needs attention for anyone who can edit the church account.
- Every date and time in the app is the church's (or the campus's). Someone whose phone is in another zone sees
  times labeled with the church's zone, like "9:00 AM ET", and event pages add their own time too.
- Serving reminders now go out the day before the service in the church's zone. Before this, the server read a
  service plan's time as UTC, so reminders for churches in the Americas went out several hours early.

## Deleting accounts (version 25)

For an existing project, run `supabase/upgrade-25.sql` after version 24. It adds **Me, Delete my account**, which
Google Play requires. Deleting removes the person's account and what's personal; giving records, ticket payments,
kids' past check-ins, safety reports and what they made for the church stay with the church, without the account.
Someone who is a church's primary account holder, or has recurring gifts running, is asked to sort those out first.
The website's `/delete-account/` page is the address to give Google Play for deletion requests.

## NFC tags (version 24)

For an existing project, run `supabase/upgrade-24.sql` after version 23. It adds tag links (Ministry tools, **NFC tags**)
and counts their taps. Until it's run, tag links save on the device that made them but tags won't open for anyone else.

- A tag holds `ourfaithfulchurch.com/t/<code>`. Cloudflare Pages already serves the app for that address, so there's
  nothing else to set up. Change where a tag link opens any time; tags already written follow.
- **Writing tags** works in Chrome on Android, and in the Play Store app. iPhones can read tags but can't write them
  from a web app: use an NFC writing app, or order tags that arrive already written.
- **Approved suppliers** are listed in `NFC_SUPPLIERS` at the top of `src/js/89b-nfc.js`, with each one's minimum,
  starting price, delivery time, sizes and what files it needs. Check a supplier's site, then add it there.

## The website and the app's address

`ourfaithfulchurch.com/` is the Our Faithful website (`church-platform/site/`); the app is at
`ourfaithfulchurch.com/app/`. Everything that pointed at the root keeps working: the website sends a link with a
`#screen` or an app setting in it, a church's address (`/riverside`), a tag link (`/t/give`), anyone signed in, a paired
church screen and the installed app straight on to `/app/`. Ad and campaign tags (`utm_`, `gclid`) stay on the website,
and `/?home` always shows it. One service worker at the root looks after both, so push notifications and the screens'
saved media carry on.

To finish the move on the server side (links work without it, through the website, but with one extra hop):

1. In Supabase, **Edge Functions, Secrets**: set `APP_URL` to `https://ourfaithfulchurch.com/app/`. Push notifications,
   emails and payment receipts then link straight into the app.
2. In Supabase, **Authentication, URL Configuration**: add `https://ourfaithfulchurch.com/app/` to **Redirect URLs** (or
   keep `https://ourfaithfulchurch.com/**`, which covers it). Sign-in emails then come back to the app directly.

## Church web addresses

Every church's landing page has its own web address, made from its church ID (Admin, Account details):

- **`ourfaithfulchurch.com/riverside`** works as soon as the app is on Cloudflare Pages, with nothing to set up. Pages
  answers any unknown address with the app, and the app opens that church's page.
- **`riverside.ourfaithfulchurch.com`** needs a wildcard DNS record and a small Cloudflare Worker
  (`church-platform/church-sites`), because Pages can't serve a wildcard subdomain:
  1. In Cloudflare, **ourfaithfulchurch.com, DNS, Records, Add record**: type **A**, name **`*`**, IPv4 address
     **`192.0.2.0`**, **Proxied** (orange cloud). Records you already have (www, mail) keep working as they are.
  2. Make an API token: **My Profile, API Tokens, Create Token**, the **Edit Cloudflare Workers** template, limited to
     your account and the ourfaithfulchurch.com zone. Copy your **Account ID** from the domain's overview page.
  3. In GitHub, **Settings, Secrets and variables, Actions**, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
     Then **Actions, Church subdomains (Cloudflare Worker), Run workflow**.
  4. Open `https://riverside-marietta.ourfaithfulchurch.com/` (any live church's ID works). When it shows the page,
     set `churchSubdomains: true` in `public/config.js` so the app shows subdomain addresses.
- **A shorter domain** (optional): add it to Cloudflare, add a route for it in `church-sites/wrangler.toml`, set
  `SHORT_DOMAIN` there and `shortDomain` in `config.js`. `SHORT.example/riverside` then forwards to the church's page.

On a church subdomain only the public pages open (landing page, Plan your visit, campus map). Joining, signing in and
everything else go to the app's main address, where sign-ins and paired devices live. When a church changes its ID, its
old address keeps working and shows the new one. Names the app uses itself (admin, give, help and others) can't be
church IDs.

## Demo and training

Share these links with churches you're inviting, or with new staff and volunteers:

- Demo: `https://ourfaithfulchurch.com/?demo`
- Training: `https://ourfaithfulchurch.com/?training`

They need no account and nothing to set up. Each opens a sample church in the visitor's own browser, with them as its administrator, so they can try and change everything. Nothing they do reaches your database, and no money moves. Signed-in staff can also choose **Me, Practice, Training, Practice with a copy of** their church, to rehearse changes on their own church's setup.

**A shared training church** lets a whole team practise together, on any device, and see each other's changes. An administrator creates it under **Admin, Training church**, filled with sample content or a copy of the church's setup (its sermons, events, classes, songs, services, forms, signage and settings, but no people, gifts, prayers, messages or drafts). Share the invite link; members of the church also find it under **Me, Practice**. People who join can practise everything unless you choose otherwise. A training church can't connect a payment processor, sends nothing to webhooks or text-to-give, is hidden from **Find your church**, and its administrators can reset it to fresh content or delete it from **Admin, Training church**. It needs `supabase/upgrade-6.sql` (new projects get it from `schema.sql`).

## Troubleshooting

- **"Some changes weren't saved. Your role may not allow them."** A security rule refused a change. Check the person's role and location access under **Admin, People**. The browser console names the record and the rule's message.
- **The old address doesn't forward to the new one.** It forwards only when `https://ourfaithfulchurch.com/config.js` opens and shows the app's settings. If it doesn't open, finish steps 1 to 4 of [Your own domain on Cloudflare](#your-own-domain-on-cloudflare).
- **No reminder emails about a deactivated church.** Check step 13: the hourly job (`select * from cron.job_run_details order by start_time desc limit 5;`), the `church-lifecycle` function's log, and that an email sender is set. The in-app reminders don't depend on email.
- **Sign-in codes don't arrive.** Check spam, then **Authentication, Logs**. Connect your own SMTP sender (step 3.4).
- **Checkout says the church isn't set up for online payments.** Connect a processor under **Admin, Giving, Online payments**. If connecting fails, the message says what the processor didn't accept.
- **A payment went through but doesn't show in the app.** Check **Edge Functions, pay-webhook, Logs** in Supabase, and in the processor's dashboard check that the webhook pointing at `pay-webhook` is enabled. Reconnecting the church's keys sets the webhook up again.
- **Push doesn't arrive.** Check the Database Webhook's logs and that the phone allowed notifications for the site.
- **A function fails.** `supabase functions logs FUNCTION-NAME` shows its errors.

## Before you launch

- Write a privacy policy. The app stores children's names, birthdays, allergies and photos of people allowed to pick them up, prayer requests, messages and giving records.
- Decide who at each church can see what: start everyone as **Member**, and give staff roles only what they need.
- Back up: Supabase Pro includes daily backups; on the free tier, export the database from **Database, Backups** regularly.

### Version 22 account diagnostics and household links

Run `supabase/upgrade-22.sql` after the earlier upgrades and before deploying the app build. In Supabase, provision a dedicated signed-in support identity with no church memberships or church ownership. Add its Auth UUID to `public.support_staff` through the SQL editor. The agent opens the app at `#help` to redeem a key.

A user can grant access to their own account diagnostics. A primary account holder can grant access to church diagnostics. The grant is read-only and expires after 24 hours or when either side closes the case. A fresh key is needed if the issue continues past that window.

### Version 23 door checks

For an existing Supabase project, run `supabase/upgrade-23.sql` after the earlier upgrades and before deploying the app build. Security supervisors manage entryways and assignments under **Security Command → Doors & Entryways**. Assignments already saved in the app carry over. Members assigned to a required entryway can submit a check while an alert or drill with door checks is active.
