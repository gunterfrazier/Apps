# Koinonia

A phone-first church app that many churches share. People create an account, find their church and join it. A church registers its own account, separate from any person's, and the person who registers it becomes its primary account holder. From there the church sets up roles, locations, features and content.

"Koinonia" is a working name. Change it in `PLATFORM` at the top of `src/js/00-util.js` and in `public/manifest.webmanifest`.

## What's in it

**Accounts, roles and locations**
- Church accounts with a unique church ID, contact details, logo, colors, website and social links. The primary account holder can hand the account to someone else.
- Roles from most to least access: Administrator, Pastor, Ministry staff, Media coordinator, Teacher, Group leader, Check-in team and Member, plus any custom roles. Each role has 29 permissions to turn on or off. New members get the default role, which starts as Member, the lowest level.
- Administrators start with full access, and only the primary can limit them. Everyone else can only change roles, and give roles, below their own.
- Features can be turned off for the whole church, and the primary or an administrator chooses the defaults: role, private-location access, directory listing, prayer privacy, parent check-out and the first giving fund.
- Campuses and locations, each with a unique ID (MAIN, EAST), rooms, service times and a livestream link. Locations are public or private. Each member sees every public location, and the private ones they've been given access to (or all of them).

**For everyone**
- Home with the church's banner, landing page blocks, quick actions, the latest sermon, service times, an events carousel, reading plan and announcements.
- A Home banner each church designs with a live preview: a gradient, color or photo background, its logo, built-in graphics (cross, dove, sparkle, sunburst and more) or uploaded ones that can be sized, placed, turned and faded, and text art in seven styles.
- Sermons with notes, reading plans, a passage lookup, and links into Veritas Logos.
- Events with sign-ups that can include kids, Google Calendar links and directions.
- Classes and Sunday school (several sections and hours, each named) and small groups, with a room or place, a single date or a weekly schedule with start and end dates, and registration that is not needed, required, or approved by the leader.
- Parent portal: each child's classes, groups and events, the teacher and room, what the class is learning, and check-in and check-out.
- Chat: group and class chats, teacher and parent chats, leadership chat and direct messages.
- Prayer wall, member directory, giving, kids and volunteer check-in, Watch live with the order of service, and a QR code scanner.
- Households with allergies (printed in bold on name tags and flagged for teachers), care notes, and the people allowed to pick up each family's kids, with photos.

**Ministry tools**, by permission
- Sermon builder, Sunday school lesson builder (for teachers assigned to a class) and Bible study guide builder. Add Scripture (filled from the BSB or KJV), points, keynotes, media, text, questions, cues that can show a QR code, and private notes. Each block is shown on screen or kept private, with its own speaker notes. The presenter page lists every block with its slide number and notes, plus your resource notes.
- Service plans: the order of service with start times, who leads each part, and team notes. Save segments you repeat every week and add them to any service, or copy a whole service to the next week.
- Reorder segments and builder items by dragging the handle, with the up and down arrows, with the arrow keys, or by picking a position when editing one.
- Named layouts: save a service plan or a sermon, lesson or study outline as a layout, then start new ones from it or add it to an existing one. For each segment or item, keep everything, only some sections (song verses, Bible verses, paragraphs, sermon items, parts of a graphic), just an empty slot, or leave it out.
- Save a single segment or builder item for reuse the same way, with all or part of its content.
- Songs with lyrics in sections, an arrangement order and CCLI details. Each service can sing only some of a song's sections.
- Presentation: run a service plan or a built sermon as a slideshow (arrow keys, swipe, black screen, logo screen, full screen, and a display window for a second screen on your own website) or let someone scroll through at their own pace.
- QR codes for joining the church, the landing page, giving, events, registration, classes, check-in and check-out, as PNG or SVG.

**Volunteer teams and the worship team's screens**
- Teams with positions (Worship: worship leader, vocals, keys and so on). People join teams themselves or a scheduler adds them.
- Schedulers ask people to fill positions for each service plan. The schedule shows who's confirmed, waiting or can't serve. **Fill open spots** asks the team members who are free, skipping anyone away that day or already serving, and spreading the asks so the same people aren't asked every week. Schedulers can remind people who haven't answered, mark someone confirmed, or message them.
- Volunteers see requests on Home and under **Me, Serving**, accept or decline with a note, and add the dates they're away.
- Notifications under the bell: asks, answers and reminders. Once push is set up they also go to people's phones.
- Stage display: a confidence monitor for the band and preacher with the words now, what's next, the clock, time left in the current part of the service (it turns red when over), speaker notes, and messages from the booth ("Repeat the chorus"). Use it as the Stage view on the operator's screen or open it as its own window.
- Countdown segments that count down to the service start time or for the segment's length.
- Livestream overlay: a see-through page for OBS, vMix or Streamlabs that puts lyrics, Scripture and live captions in a lower third.
- Live captions turn the preacher's words into text with the browser's speech recognition (Chrome, Edge or Safari) and show them on the overlay.

**Kids check-in kiosk, new people and reports**
- A self check-in kiosk for a tablet at the kids area. Families find themselves by the last four digits of their phone or their last name, tap who's here and get a name tag for each child plus a pickup tag with the same code. First-time families add themselves as guests in a minute. An optional exit code keeps kids from leaving kiosk mode, and the kiosk returns to the start if a family walks away.
- Name tags in three label sizes (4 × 2 in, 2.25 × 1.25 in and 62 × 29 mm), with allergies in a black band.
- At pickup, staff enter the code and see the parents, family and authorized pickups with photos, then choose who the kids were released to. Rosters show allergy alerts for each room.
- Newcomer follow-up: connect cards, first-time kiosk families and new members land in one list. Each person gets the church's next steps as a checklist, someone to follow up (who's notified), call, text and email buttons, a status and a notes log.
- Reports: weekly or monthly attendance (in the room, kids and online), new people and how they came, and giving by week or month and by fund. Every chart has a hover readout, a table view and a CSV download. Record head counts after each service; kids check-ins are counted for you.

**Paid events, forms and rooms**
- Ticketed events: ticket types with prices and limits (Student $85, Adult leader $40), a checkout, receipts by email once payments are live, cancel and refund, and a sign-up list with payments and CSV download.
- Forms built from 12 kinds of question, including multiple choice, checkboxes, dates and a signature pad. Start from a template: permission slip, event questions, volunteer application or contact update. Share by link or QR code, list on the Connect tab, attach to an event, or add a fee.
- Permission slips take one response per child, prefill allergies from the household, and collect a parent's drawn signature and typed name. An event with a slip asks for it after sign-up and shows which kids still need one.
- Responses with search, a detail view with the signature, and CSV download. Someone chosen is notified of each new response.
- Room booking: a day view of every room with what's in it (bookings, events, classes and groups, and worship services), requests once or weekly, live conflict checks that suggest rooms that are free, and approval by people who manage locations. Events can't be saved into a room that's already in use.
- Payments go through one checkout. In the preview and until Stripe is connected it runs in test mode and nothing is charged.

**Sermon media and AI help**
- Sermons with a video link (YouTube, Vimeo, Facebook or a file) and an audio file, played in the app with playback speeds.
- Transcripts pasted in, opened from a text, VTT or SRT file, or taken from the live captions of the last presentation. Timed transcripts let people jump to that moment in the audio. Each transcript can be searched on its sermon's page.
- A searchable archive: the Word tab searches titles, passages, speakers, series, summaries, outlines and every transcript, shows where each match was found, and filters by book of the Bible.
- A podcast feed (RSS with Apple Podcasts tags) built from every sermon with audio, with a readiness check for cover art, owner email and file sizes, and a download of feed.xml.
- AI help through Veritas Logos for people who teach: small-group discussion questions from a sermon (into a new study guide or the builder), a full kids Sunday school lesson from Sunday's passage, and a sermon summary and outline. Each prompt carries the passage text from the Bible data shared with Veritas Logos, and every result arrives as a draft to check and edit. In the preview it uses Claude through the page; on your own site it calls your AI function.

**Notifications, Spanish and accessibility**
- A notification center under the bell for asks to serve, answers, reminders, messages, room requests, form responses and new people to follow up. Announcements can be sent as notifications too.
- Reminders the day before you serve, an event you signed up for, or your class or group meets.
- Push notifications through the service worker: turn them on under Me, Settings. While the app is open in the background it shows them on its own; with Supabase and VAPID keys set up, the server sends them when the app is closed. Quiet hours hold them from 9 PM to 7 AM.
- Choose which kinds you get: announcements, messages, serving, events and classes, and staff updates.
- Spanish for member screens: tabs, menus, buttons, forms, check-in (including the kiosk families use) and dates. It follows the phone's language until someone picks one. What the church writes stays as written.
- Larger text (two steps up), more contrast, reduced motion, a skip-to-content link, and focus that moves to each new screen for keyboard and screen reader users.
- Read aloud for Scripture passages, sermons and transcripts, announcements and published outlines.

**For admins**
- A landing page built from blocks: banners, graphics and photos you upload, information, buttons and links, video, embedded pages, events, classes, service times and social links.
- Webhooks for fifteen events, signed with HMAC-SHA256, with a message log. Embedded pages listed in the app.
- Announcements, events, sermons, reading plans, classes and groups, prayer moderation, connect cards, check-in rosters, people, and giving reports.

### Song lyrics and copyright

The app doesn't fetch lyrics from the web. Most worship songs are copyrighted, and churches project them under a CCLI license. Songs are pasted in, with "Find on SongSelect" and "Find a hymn" search links. Song slides show the copyright line, the CCLI song number and the church's CCLI license number. Hymns published before 1929 are public domain; the sample church includes three.

### Veritas Logos

Sermons, groups, reading plans and builder documents link into Veritas Logos to read a passage, ask about it, or start a study guide on its topic. The Bible text used by the builders comes from Veritas Logos's data (`../veritas-logos/public/data/bible`), and the build copies it in, so it isn't stored twice.

The default link is your private Veritas Logos page, so links only open for you. For members to use them, host Veritas Logos on a public site and change `PLATFORM.veritasUrl`, or set it per church under Account details.

## Try it

The preview keeps everything in the browser and starts with three sample churches. Under **Me, Preview tools** you can become the primary account holder of a sample church or try any role. **Reset sample data** starts over. No money moves.

## Build and test

Needs Node 22 or later. There are no dependencies.

```bash
node build.mjs          # writes dist/: index.html (one self-contained file), icons, the QR reader and the Bible text
node test/smoke.mjs     # clicks through every feature at phone size (needs Playwright)
```

Edit the files in `src/`, not `dist/`. `src/vendor/qrcode.js` (MIT) and `public/vendor/jsQR.js` (Apache-2.0) are the QR libraries.

## Going live

The app is complete on screen. These parts need outside services before real churches use it:

1. **Host it.** Upload `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages). On its own site it installs to the home screen, works offline through `public/sw.js`, frames embedded pages and videos, uses the camera to scan QR codes, and opens a second display window for presentations. Bump `VERSION` in `sw.js` with each release.
2. **Shared data and sign-in.** Today data lives in one browser, so people can't see each other's posts, sign-ups or messages. Create a Supabase project, run `supabase/schema.sql`, and replace the body of the `S` store in `src/js/20-store.js` with Supabase calls. The schema mirrors the app: church accounts with a primary owner, roles with permissions, locations with public or private visibility, and row-level security that checks permissions and location access on every table. Members get published sermons and lessons through `published_doc()`, which strips private blocks and notes. Use Supabase Storage for logos and uploaded images, and Supabase Realtime for chat.
3. **Real giving.** Use Stripe Connect: each church connects its own Stripe account, the app sends gifts to Stripe Checkout, and a server function records completed payments in `gifts` from Stripe's webhook.
4. **Webhook delivery.** Database triggers or server functions add rows to `webhook_deliveries`, and a small worker posts each one with the `X-Koinonia-Signature: t=timestamp,v1=signature` header and retries failures. Receivers check the signature with HMAC-SHA256 of `timestamp.body` and the webhook's secret.
5. **Push notifications.** Web Push (VAPID keys and a server function) or a service such as OneSignal, for announcements and new messages.
6. **App stores (optional).** For Google Play, wrap the site with Bubblewrap (a Trusted Web Activity). For the App Store, wrap it with Capacitor.

Before launch, write a privacy policy that covers children's names, birthdays and care notes, prayer requests, messages and giving records.

## Project layout

```
src/index.html        Page shell
src/styles.css        All styles: bright and modern, with dark mode and the presentation console
src/js/00-util.js     Settings, permissions list, safe HTML, dates, Scripture and Bible text, images, QR, icons
src/js/10-seed.js     Sample churches, people, roles, classes, builder documents and a service plan
src/js/20-store.js    Data store, roles and location access, webhooks, schedules
src/js/30-ui.js       Router, layout, location filter, embeds, sheets
src/js/31-banner.js   Home banner and its designer
src/js/40-68          Screens: home and Watch live, word, events, connect (classes, groups, prayer, directory),
                      give, check-in, me and ministry tools, admin, landing page, builders, service plans and songs,
                      presentation, chat, QR, webhooks and embeds, parent portal, layouts, volunteers,
                      stage display and livestream overlay, check-in kiosk, follow-up, reports,
                      payments, forms, rooms, sermon media and podcast, AI drafts, settings, Spanish
public/               Manifest, service worker, icons, QR reader
supabase/schema.sql   Database schema with security rules
test/smoke.mjs        End-to-end check
```

## Known limits

- Downloadable calendar files (.ics) aren't offered; Google Calendar links are.
- Name tags print through the browser's print dialog to whatever label printer the kiosk device uses. To print without the dialog, run Chrome with `--kiosk --kiosk-printing` and set the label printer as the default. Tags don't print in the preview.
- The stage display, display window and overlay follow the operator through the browser, so they need to run on the same computer. Once Supabase Realtime is connected, they can run on any device.
- Live captions depend on the browser's speech recognition, which sends audio to the browser maker's service, and need a microphone the browser is allowed to use.
- Recordings and livestreams play by opening or framing the church's video link. Saving audio for offline listening needs the church to host its files on the same site.
