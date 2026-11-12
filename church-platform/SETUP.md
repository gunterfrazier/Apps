# Setting up Koinonia for real churches

The preview keeps everything in one browser. This guide connects the app to the services that let real people share data, sign in, give money and get notifications. Do the steps in order. Steps 1 to 5 give you a working shared app; the rest add payments, push notifications, AI drafts, schedules and text-to-give, and can come later.

You'll need about two hours, a GitHub account (you have one), and free accounts at Supabase and Stripe.

| Service | What it does here | Cost to start (check current prices) |
| --- | --- | --- |
| GitHub Pages | Hosts the app's files | Free |
| Supabase | Database, sign-in, file storage, live updates, server functions | Free tier; Pro is $25 a month when you outgrow it |
| Stripe | Gifts, tickets and form fees, straight to each church's bank | No monthly fee; about 2.9% + 30¢ per card payment, 0.8% for bank payments (capped at $5) |
| Anthropic API | AI drafts for teachers | Pay per use; a draft costs about a cent |
| Twilio (optional) | Text-to-give number | About $1.15 a month per number plus a cent per text |

Nothing here costs money until a church starts taking payments or you pass the free tiers.

---

## 1. Put the app online

The app is a folder of plain files (`church-platform/dist/`), so any static host works. These steps use GitHub Pages because the code is already on GitHub.

1. Merge the `claude/church-platform` branch into `main` when you're ready (a pull request on GitHub is easiest).
2. In the repository on GitHub, open **Settings, Pages**, and under **Build and deployment** choose **GitHub Actions**.
3. Open the **Actions** tab, choose **Publish Koinonia**, and select **Run workflow**. It builds the app and publishes it.
4. When it finishes, the address is shown on the run (something like `https://gunterfrazier.github.io/Apps/`). Write it down. This guide calls it **your app address**.

At this point the app runs on its own site, still in browser-only mode. Install it on a phone to check: in Chrome choose **Install app**; on iPhone, Safari's **Share, Add to Home Screen**.

> Using your own domain (`app.yourchurch.org`)? Add it under **Settings, Pages, Custom domain** and point a CNAME record at `gunterfrazier.github.io`. Use that as your app address from here on.

## 2. Create the database

1. Sign up at [supabase.com](https://supabase.com) and create a project. Pick the region nearest your churches and save the database password somewhere safe.
2. Open **SQL Editor**, paste all of `church-platform/supabase/schema.sql`, and select **Run**. It creates the tables, the security rules and a public `media` bucket for logos and sermon audio.
3. Open **Project Settings, API** and copy two values:
   - **Project URL** (`https://abcd1234.supabase.co`)
   - **anon public** key

The anon key is safe to publish: it can only do what the security rules allow for each signed-in person.

## 3. Turn on sign-in by email code

People sign in with a 6-digit code sent to their email, with no passwords to forget.

1. **Authentication, Providers, Email**: keep Email on. Turn on **Confirm email**.
2. **Authentication, Email Templates, Magic Link**: replace the body with something that includes the code, for example:
   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this code in the app: <strong style="font-size:24px">{{ .Token }}</strong></p>
   <p>Or tap to sign in: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
   ```
   Do the same for **Confirm signup**.
3. **Authentication, URL Configuration**: set **Site URL** to your app address and add it under **Redirect URLs**.
4. **Project Settings, Authentication, SMTP**: Supabase's built-in email is limited to a few messages an hour. Before inviting a congregation, connect a sender such as Resend, Postmark or SendGrid (each has a free tier).

## 4. Point the app at the database

On GitHub, open **Settings, Secrets and variables, Actions, Variables** and add these repository variables:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the Project URL from step 2 |
| `SUPABASE_ANON_KEY` | the anon public key from step 2 |
| `APP_URL` | your app address, ending in `/` |
| `VAPID_PUBLIC_KEY` | leave blank for now (step 7) |

Run **Publish Koinonia** again. The workflow writes these into `config.js` next to the app. (Hosting somewhere else? Copy `public/config.example.js` to `config.js` in the folder you upload and fill it in.)

Open your app address. You should now see **Email me a sign-in code** instead of the preview's welcome screen.

## 5. Register the first church

1. Sign in with your email and the code.
2. Enter your name, then **Register a church**. You're its primary account holder.
3. Under **Admin**, work through **Getting started**: locations and service times, roles, the Home banner, the landing page, announcements, classes and groups.
4. Invite people with **Home, Invite a friend** or a QR code (**Ministry tools, QR codes, Join the church**). Everyone who joins starts with the default role you chose under **Features and defaults**.

From here the app is shared: sign-ups, prayer requests, chats, check-ins and everything else sync between people, and changes show up for others within a second or two.

> Data from the preview doesn't move over. Sample churches only exist in the preview.

## 6. Take real gifts, tickets and form fees (Stripe)

Each church connects its own Stripe account, so money goes straight to that church. Your platform account only coordinates (and can keep an optional small fee).

**Set up your platform account (once):**

1. Create an account at [stripe.com](https://stripe.com). Stay in **Test mode** (the toggle at the top) until everything works.
2. Open **Connect** and finish the platform setup. Choose **Standard** accounts, so each church has its own Stripe dashboard and handles its own refunds and disputes.
3. Open **Developers, API keys** and copy the **Secret key** (`sk_test_...`).
4. Open **Developers, Webhooks, Add endpoint**:
   - Endpoint URL: `https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook`
   - Select **Listen to events on Connected accounts**
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `account.updated`
   - Copy the **Signing secret** (`whsec_...`).

**Deploy the server functions.** Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and, from the `church-platform` folder:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF          # the part before .supabase.co
supabase secrets set APP_URL=https://YOUR-APP-ADDRESS/ \
  STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... PLATFORM_FEE_PERCENT=0
supabase functions deploy checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-connect
supabase functions deploy refund
supabase functions deploy recurring
```

`supabase/config.toml` tells Supabase which functions are called by outside services (Stripe, Twilio, podcast apps) and check their own signatures instead of a sign-in.

**Connect a church:** in the app, **Admin, Giving, Connect Stripe**. Stripe asks for the church's legal name, EIN and bank account (about ten minutes). When Stripe finishes checking, the test-mode notes disappear and gifts, tickets and form fees go through Stripe Checkout, which handles cards, Apple Pay, Google Pay and bank accounts, and emails receipts.

**Test it** with card `4242 4242 4242 4242`, any future date and any CVC. Check that the gift appears under **Giving history** and **Admin, Giving**. Then try a recurring gift, a ticket and its refund.

**Go live:** switch Stripe to live mode, repeat the webhook step there, and set the live keys with `supabase secrets set`. Each church reconnects once in live mode.

Year-end statements need nothing extra: members download a PDF under **Giving history**, and staff download every giver's statement in one PDF under **Admin, Giving**. Add the church's EIN there so it prints on statements.

## 7. Push notifications

1. Make a key pair (run anywhere with Node): `npx web-push generate-vapid-keys`
2. Add the **public** key as the `VAPID_PUBLIC_KEY` repository variable (step 4) and run **Publish Koinonia** again.
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

Then open `supabase/cron.sql`, replace `YOUR-PROJECT` and `YOUR-SERVICE-ROLE-KEY` (from **Project Settings, API**), and run it in the SQL editor. It sends queued webhook messages every minute and adds day-before reminders every hour. The service role key goes into Supabase Vault, not into the app.

## 10. Podcast feed

```bash
supabase functions deploy podcast
```

Under **Admin, Sermons, Podcast feed**, fill in the show details and cover art, then **Copy feed address** and submit it once to [Apple Podcasts Connect](https://podcastsconnect.apple.com) and [Spotify for Podcasters](https://podcasters.spotify.com). New sermons with an audio file appear on their own. With Supabase connected, staff can upload sermon audio and video straight from **Media and transcript**.

## 11. Text to give (optional)

1. Buy a number at [twilio.com](https://twilio.com) (US numbers need A2P 10DLC registration for texting, which Twilio walks you through).
2. Deploy and set the secrets:
   ```bash
   supabase secrets set TWILIO_AUTH_TOKEN=... SMS_PUBLIC_URL=https://YOUR-PROJECT.supabase.co/functions/v1/sms
   supabase functions deploy sms
   ```
3. In Twilio, set the number's **A message comes in** webhook to the same `SMS_PUBLIC_URL` (HTTP POST).
4. In the app, **Admin, Giving**: enter the number and a keyword. People text `GIVE 50` and get a link to finish the gift. One number can serve one church.

## 12. Check that everything works

- [ ] Two people on different phones join the same church and see each other's prayer requests and chat messages.
- [ ] A member can't open **Admin**, and a teacher sees only their own classes in the lesson builder.
- [ ] A test gift shows in the giver's history and in **Admin, Giving**; a refunded ticket shows as refunded.
- [ ] Turning on push and posting an announcement with **Also send it as a notification** reaches a phone with the app closed.
- [ ] A webhook pointed at [webhook.site](https://webhook.site) receives `member.joined` with a valid signature.
- [ ] The kiosk finds a family and prints a name tag on your label printer.

## Troubleshooting

- **"Some changes weren't saved. Your role may not allow them."** A security rule refused a change. Check the person's role and location access under **Admin, People**. The browser console names the record and the rule's message.
- **Sign-in codes don't arrive.** Check spam, then **Authentication, Logs**. Connect your own SMTP sender (step 3.4).
- **Stripe says the church isn't set up.** Finish onboarding from **Admin, Giving**; Stripe has to enable charges before checkout works. The `account.updated` webhook flips it on in the app.
- **Push doesn't arrive.** Check the Database Webhook's logs and that the phone allowed notifications for the site.
- **A function fails.** `supabase functions logs FUNCTION-NAME` shows its errors.

## Before you launch

- Write a privacy policy. The app stores children's names, birthdays, allergies and photos of people allowed to pick them up, prayer requests, messages and giving records.
- Decide who at each church can see what: start everyone as **Member**, and give staff roles only what they need.
- Back up: Supabase Pro includes daily backups; on the free tier, export the database from **Database, Backups** regularly.
