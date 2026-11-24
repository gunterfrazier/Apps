# Our Faithful Screens (Google TV / Android TV)

The church's TV screens as an app: lobby signage, classroom and room displays, presentation and stage screens.
It's one full-screen WebView showing the Our Faithful web app (`https://ourfaithfulchurch.com/?tv=1`), which already
pairs a screen and plays its job. The app adds what a TV needs around it:

- Stays on and fills the screen; no system bars.
- Videos and music start on their own (no tap needed).
- Reopens itself after a power cut or restart.
- If the internet is down when it starts, it shows a "Can't reach Our Faithful" panel and tries again every 30 seconds,
  and straight away when the network comes back. Once a screen has played, its saved playlist keeps playing offline.
- Back leaves full-screen video; on a screen's own page it takes two presses to close, so a bumped remote doesn't
  take the lobby screen down.
- A TV that isn't set up yet opens straight to **Set up a church device**, with the code box focused for the remote.

Google TV has no Chrome, so this uses the system WebView rather than a Trusted Web Activity (the phone apps use TWAs).

## Building

You don't need Android Studio: GitHub Actions builds it (`.github/workflows/our-faithful-screens-tv.yml`) whenever
this folder changes, or from **Actions, Our Faithful Screens (Google TV), Run workflow**.

- **Every run:** `our-faithful-screens-debug` (a debug APK to sideload for testing; it installs beside the release app).
- **With the signing secrets set:** `our-faithful-screens-release`, holding the `.aab` for Google Play and a signed APK.

To build on a computer instead: install Android Studio (or the SDK and JDK 17), then `./gradlew assembleDebug`.
Point it at a test site with `./gradlew assembleDebug -PappUrl=https://your-preview.example/?tv=1`.

## The signing key (once, kept forever)

Google Play needs every update signed with the same upload key. Make it on your own computer, never in a chat:

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 upload.jks > upload.jks.b64     # macOS: base64 -i upload.jks -o upload.jks.b64
```

Then in GitHub, **Settings, Secrets and variables, Actions**, add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the contents of `upload.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |

Keep `upload.jks` and its passwords somewhere safe (a password manager) and out of the repository. Turn on
**Play App Signing** when you create the app in the Play Console; Google then holds the real app key, and a lost upload
key can be replaced.

## Installing on a church TV without the Play Store (testing)

1. On the TV: **Settings, System, About**, press **Android TV OS build** seven times to turn on developer options.
2. **Settings, System, Developer options**: turn on **USB debugging** / **Network debugging**.
3. From a computer on the same network: `adb connect <tv-ip>` then `adb install our-faithful-screens-debug.apk`.
   (Or use the "Send Files to TV" app, then open the APK with a file manager.)

## Reopening after a power cut on Google TV

Android TV boxes reopen the app on their own. Google TV (Android 10 and later) only lets an app open itself from the
background if it may display over other apps. Once per TV:

```sh
adb shell appops set com.ourfaithfulchurch.screens SYSTEM_ALERT_WINDOW allow
```

Some TVs (Sony, TCL, Hisense commercial modes) also have their own "start this app when the TV turns on" setting,
which works too.

## Google Play listing (TV)

- Category: the app needs `android.software.leanback` and declares the TV banner (`res/drawable-xhdpi/banner.png`,
  320x180). Play also wants the large banner `store/tv-banner-1280x720.png` and at least one 1920x1080 TV screenshot.
- In the Play Console, opt the app in to **Android TV** under **Advanced settings, Form factors**, then submit for the
  TV review (it checks the remote works everywhere and there's no touch-only control).
- Target API 36, minimum Android 6 (API 23).
