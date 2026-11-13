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

The app is a folder of plain files (`church-platform/dist/`), so any static host works. These steps use GitHub Pages because the code is already on GitHub.

1. Merge the `claude/church-platform` branch into `main` when you're ready (a pull request on GitHub is easiest).
2. In the repository on GitHub, open **Settings, Pages**, and under **Build and deployment, Source** choose **GitHub Actions** (not "Deploy from a branch": that publishes the source files, not the built app).
   Then open **Settings, Environments, github-pages**. Under **Deployment branches and tags**, make sure `main` is allowed: choose **No restriction**, or keep **Selected branches and tags** and add `main`. If only `claude/church-platform` is listed, publishing fails with "Invalid deployment branch".
3. Open the **Actions** tab, choose **Publish Our Faithful Church App**, and select **Run workflow**. It builds the app and publishes it.
4. When it finishes, the address is shown on the run (something like `https://gunterfrazier.github.io/Apps/`). Write it down. This guide calls it **your app address**.

At this point the app runs on its own site, still in browser-only mode. Install it on a phone to check: in Chrome choose **Install app**; on iPhone, Safari's **Share, Add to Home Screen**.

> Using your own domain (`app.yourchurch.org`)? Add it under **Settings, Pages, Custom domain** and point a CNAME record at `gunterfrazier.github.io`. Use that as your app address from here on.

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
   - **Site URL**: your app address, for example `https://gunterfrazier.github.io/Apps/`.
   - **Redirect URLs**: add the same address with `**` on the end, for example `https://gunterfrazier.github.io/Apps/**`.
   Without these, the link in the email goes to `localhost` and doesn't open. With them, signing in by link works right away.
3. **Connect an email sender** under **Authentication, Emails, SMTP Settings**. Supabase's built-in email only delivers to the people on your Supabase team, a few an hour, so the congregation can't sign in until this is done. Free projects created since June 2026 also can't change the email wording until it's done. Any SMTP service works:
   - With your church's own web domain: Resend, Postmark, Brevo or SendGrid (each has a free tier). Add the DNS records they give you so mail isn't marked as spam.
   - Without a domain: a Gmail account for the church, with 2-step verification on and an app password. Host `smtp.gmail.com`, port `465`, the Gmail address as user and sender, the app password as password. Gmail allows about 500 emails a day.
4. **Put the code in the emails** (once step 3 is done), under **Authentication, Emails, Templates**. Supabase sends **Confirm signup** the first time someone signs in and **Magic Link** every time after; edit both:
   - Subject: `Your Our Faithful Church App code: {{ .Token }}`
   - Message body: all of `church-platform/supabase/templates/confirm-signup.html` (Confirm signup) or `magic-link.html` (Magic Link).

To check it: in the app, enter your email. The email that arrives should have the link, and after step 4 the code too. A link or code from an older email stops working once a newer one is sent.

## 4. Point the app at the database

This is already done: `public/config.js` names your project, and the build puts it next to the app. Run **Publish Our Faithful Church App** again after step 2 so the published site picks it up.

To use a different project without changing the code, add repository variables on GitHub under **Settings, Secrets and variables, Actions, Variables**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL` (your app address, ending in `/`) and later `VAPID_PUBLIC_KEY`. When `SUPABASE_URL` is set, the workflow writes those into `config.js` instead. (Hosting somewhere else? Upload `config.js` with the rest of the `dist` folder.)

Open your app address. You should now see **I have an account** and **I'm new here** instead of the preview's welcome screen.

## 5. Register the first church

1. Choose **I'm new here**, enter your email and the code from the email, then your name and a password. (An account made before passwords were added is asked for a name and password once, the next time it opens the app.)
2. Choose **Register a church**. You're its primary account holder.
3. Under **Admin**, work through **Getting started**: locations and service times, roles, the Home banner, the landing page, announcements, classes and groups.
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

1. Make a key pair (run anywhere with Node): `npx web-push generate-vapid-keys`
2. Add the **public** key as the `VAPID_PUBLIC_KEY` repository variable (step 4) and run **Publish Our Faithful Church App** again.
3. Set the server secrets and deploy:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@yourchurch.org PUSH_HOOK_SECRET=any-long-random-text
   supabase functions deploy push
   ```
4. In Supabase, **Database, Webhooks, Create a new hook**: table `records`, event **Insert**, type **Supabase Edge Functions**, function `push`, and add an HTTP header `x-hook-secret` with the same random text.

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

Kiosks, lobby screens, presentation and stage screens and the booth computer sign in as devices, with their own accounts, so nobody leaves a staff login on a shared screen.

```bash
supabase functions deploy device-pair
```

1. In the app, **Admin, Screens and devices, Add a device**. Choose what it does, its location, and an exit code if you want one. You get a 6-character code that lasts 30 minutes.
2. On the device, open the app and choose **Set up a church device** (under the sign-in box), or scan the QR code next to the code. Enter the code. The device signs in and goes straight to its screen.
3. To sign a device out, open it in **Screens and devices** and choose **Remove device**. Its account is deleted and the screen goes back to sign-in.

Each device gets only what its job needs: a kiosk can check kids in, presentation and stage screens and the booth can present, and a signage screen can only read its church's playlists and public information. Device accounts don't appear in the member directory or the people list. Codes are single-use and expire; a wrong code is refused after a short pause.

For signage, make a playlist under **Admin, Digital signage** first, then add a **Signage screen** device that plays it.

## 13. Check that everything works

- [ ] Two people on different phones join the same church and see each other's prayer requests and chat messages.
- [ ] A member can't open **Admin**, and a teacher sees only their own classes in the lesson builder.
- [ ] A test gift shows in the giver's history and in **Admin, Giving**; a refunded ticket shows as refunded.
- [ ] Turning on push and posting an announcement with **Also send it as a notification** reaches a phone with the app closed.
- [ ] A webhook pointed at [webhook.site](https://webhook.site) receives `member.joined` with a valid signature.
- [ ] The kiosk finds a family and prints a name tag on your label printer.
- [ ] A paired presentation screen on another computer shows the booth's slides as you move through them, and goes back to its logo or playlist when you close the presenter.

## Demo and training

Share these links with churches you're inviting, or with new staff and volunteers:

- Demo: `https://gunterfrazier.github.io/Apps/?demo`
- Training: `https://gunterfrazier.github.io/Apps/?training`

They need no account and nothing to set up. Each opens a sample church in the visitor's own browser, with them as its administrator, so they can try and change everything. Nothing they do reaches your database, and no money moves. Signed-in staff can also choose **Me, Practice, Training, Practice with a copy of** their church, to rehearse changes on their own church's setup.

**A shared training church** lets a whole team practise together, on any device, and see each other's changes. An administrator creates it under **Admin, Training church**, filled with sample content or a copy of the church's setup (its sermons, events, classes, songs, services, forms, signage and settings, but no people, gifts, prayers, messages or drafts). Share the invite link; members of the church also find it under **Me, Practice**. People who join can practise everything unless you choose otherwise. A training church can't connect a payment processor, sends nothing to webhooks or text-to-give, is hidden from **Find your church**, and its administrators can reset it to fresh content or delete it from **Admin, Training church**. It needs `supabase/upgrade-6.sql` (new projects get it from `schema.sql`).

## Troubleshooting

- **"Some changes weren't saved. Your role may not allow them."** A security rule refused a change. Check the person's role and location access under **Admin, People**. The browser console names the record and the rule's message.
- **Sign-in codes don't arrive.** Check spam, then **Authentication, Logs**. Connect your own SMTP sender (step 3.4).
- **Checkout says the church isn't set up for online payments.** Connect a processor under **Admin, Giving, Online payments**. If connecting fails, the message says what the processor didn't accept.
- **A payment went through but doesn't show in the app.** Check **Edge Functions, pay-webhook, Logs** in Supabase, and in the processor's dashboard check that the webhook pointing at `pay-webhook` is enabled. Reconnecting the church's keys sets the webhook up again.
- **Push doesn't arrive.** Check the Database Webhook's logs and that the phone allowed notifications for the site.
- **A function fails.** `supabase functions logs FUNCTION-NAME` shows its errors.

## Before you launch

- Write a privacy policy. The app stores children's names, birthdays, allergies and photos of people allowed to pick them up, prayer requests, messages and giving records.
- Decide who at each church can see what: start everyone as **Member**, and give staff roles only what they need.
- Back up: Supabase Pro includes daily backups; on the free tier, export the database from **Database, Backups** regularly.
