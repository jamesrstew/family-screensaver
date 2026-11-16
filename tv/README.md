# Stewart Family App for TV (feasibility spike)

A tiny Android TV / Google TV app that shows the family web app full screen in a WebView. It
exists to answer four questions on the real TV: Can Google Assistant open it by name? Can it
deep-launch specific pages? Can the app hear the user? Can it be the screensaver? If the answers
are good, this becomes the real TV shell.

- Package: `com.jamesstewart.family` (minSdk 26, target/compile SDK 36, Kotlin, no third-party deps)
- `FamilyActivity`: full-screen WebView loading `FAMILY_URL/?page=<page>`; keeps the screen on;
  D-pad/Enter go to the page; Back goes back in page history, then exits.
- Launcher entries (activity aliases): **Stewart Family App** (`home`), **Family Weather** (`weather`),
  **Family Week** (`week`), **Family Ideas** (`notebook`), plus **Family Mic Test**.
- `FamilyDream`: the screensaver (labeled "Stewart Family App"), loading `?page=home&mode=screensaver`.
- If no URL was set at build time, or the URL can't be reached, a bundled page says so.

## Build

Tooling (installed via Homebrew): `openjdk@17`, `android-commandlinetools` (SDK at
`/opt/homebrew/share/android-commandlinetools`, with platform 36, build-tools 36.0.0, platform-tools).

```sh
cd tv
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
./gradlew assembleDebug -PfamilyUrl=http://192.168.1.50:3000   # your app URL, no trailing ?page
# -> app/build/outputs/apk/debug/app-debug.apk
```

`local.properties` (git-ignored) points at the SDK; recreate it if needed:
`echo sdk.dir=/opt/homebrew/share/android-commandlinetools > local.properties`.

Cleartext `http://` URLs are allowed (handy for a dev server on the LAN), but pages served over
plain http are not a secure context, so `getUserMedia` won't work there; use https or `localhost`
for any in-page mic features. The Mic Test's own WebView check (3c) doesn't depend on the URL.

## One-time TV setup

1. **Developer options:** Settings → System → About → scroll to **Android TV OS build** (or
   **Build**) and press OK on it 7 times until it says you're a developer.
2. **Debugging:** Settings → System → Developer options:
   - Older Android TV: turn on **USB debugging** and **Network debugging** (or **ADB debugging**).
     The TV listens on port 5555.
   - Newer Google TV (Android 11+): turn on **Wireless debugging**, open it, and choose
     **Pair device with pairing code**. It shows an `ip:port` and a six-digit code.
3. **TV IP:** Settings → Network & Internet → (your network) shows the IP address. The Wireless
   debugging screen also shows `IP address & Port` for connecting (a different port from pairing).

## Install

```sh
ADB=/opt/homebrew/share/android-commandlinetools/platform-tools/adb

# Newer Google TV, first time only:
$ADB pair <tv-ip>:<pairing-port>          # enter the six-digit code
# Every time:
$ADB connect <tv-ip>:<port>               # port from the Wireless debugging screen, or 5555
$ADB install -r app/build/outputs/apk/debug/app-debug.apk

# Or, all in one (rebuilds when a URL is given):
scripts/install.sh <tv-ip>:<port> https://your-family-app
```

The first `adb connect` may pop up an "Allow debugging?" prompt on the TV; accept it.

Useful while testing:

```sh
$ADB shell am start -n com.jamesstewart.family/.Weather              # launch an alias directly
$ADB shell am start -n com.jamesstewart.family/.FamilyActivity --es page week
$ADB shell am start -n com.jamesstewart.family/.MicTestActivity
$ADB logcat -s Family FamilyMic chromium                           # app + WebView logs
```

## Screensaver

```sh
$ADB shell settings put secure screensaver_components com.jamesstewart.family/.FamilyDream
$ADB shell settings get secure screensaver_components                 # verify
$ADB shell settings put secure screensaver_enabled 1
$ADB shell am start -n com.android.systemui/.Somnambulator            # start it now (if present)
$ADB shell dumpsys dreams                                             # shows the active dream
```

If `Somnambulator` isn't present, set a short timeout (Settings → System → Energy/Ambient mode, or
`$ADB shell settings put system screen_off_timeout 60000`) and wait. Google TV's own
Ambient mode may ignore third-party dreams; that's one of the things to find out. To undo:
`$ADB shell settings delete secure screensaver_components`.

## Test checklist

Record results here (TV model / OS version: TCL Smart TV Pro, Android 11, WebView 157, tested Nov. 16, 2026).

| # | Test | How | Result |
|---|------|-----|--------|
| 1 | Assistant opens the app | "Hey Google, open Stewart Family App" | **No.** Assistant treated it as a content search (YouTube). Sideloaded apps aren't matched by name. |
| 2a | Deep launch | "Hey Google, open Family Weather" — does the weather page open? | **No.** "open" and "launch" both went to a content search (logcat: `launcherx/.entity.EntityActivity`). |
| 2b | | "…open Family Week" / "…open Family Ideas" | |
| 2c | Switching while open | With the app open, "…open Family Weather" — does it switch pages? | |
| 2d | Launcher row | Do all five entries appear in Apps? | |
| 3a | `SpeechRecognizer` | Family Mic Test → button 1, speak; note transcript or error code | |
| 3a′ | `RecognizerIntent` | Button 2; does a system voice UI appear, and what comes back? | |
| 3b | `AudioRecord` | Buttons 3 and 4; does the meter move when you talk? Peak dBFS? | |
| 3b′ | Input devices | What types/product names are listed (e.g., `TYPE_BUILTIN_MIC`, `TYPE_REMOTE_SUBMIX`)? | |
| 3c | WebView `getUserMedia` | Button 5; "getUserMedia OK" and a moving meter, or the error? | |
| 3d | Remote keys | Press mic/Assistant, color, bookmark, and other keys; which show in the key log? | |
| 4 | Screensaver | After the `settings put` above, does the app appear as the screensaver? | **Yes.** `FamilyDream` runs and shows home. |
| — | Web app basics | D-pad/Enter work in the page? Back goes back, then exits? Screen stays on? | |

Notes: the mic test asks for microphone permission on first launch; allow it. If the hands-free
mic is hardware-switched off, tests 3a–3c should show that too. Everything on the Mic Test screen
is also logged under the `FamilyMic` logcat tag, so `adb logcat -s FamilyMic` is an easy way to
copy results out.
