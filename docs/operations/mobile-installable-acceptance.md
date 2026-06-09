# Mobile Installable Acceptance

The mobile requirement is accepted only when Miaochat runs as an installed
mobile app on a real device or simulator. Expo Go and mobile-browser Web checks
are useful during development, but they are not final mobile delivery evidence.

## Requirement Boundary

The original requirement names mobile as a lightweight IM client for:

- conversation browsing
- approval decisions
- artifact preview

For competition evidence, record the installed app itself. The recording must
not rely on Safari, Chrome, or Expo Go as the visible final client.

## API URL

Build and install with an API URL that the phone can reach. Do not use
`localhost` unless the app runs in the same emulator namespace and the API is
explicitly mapped there.

Good examples:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:3001 pnpm mobile:android:release
EXPO_PUBLIC_API_BASE_URL=https://miaochat-api.example.test pnpm mobile:ios:release
```

If the API is running in WSL, expose it through a LAN-reachable Windows host
address, Tailscale, Cloudflare Tunnel, ngrok, or another stable tunnel before
building the app.

## Android Acceptance

Prerequisites:

- JDK installed
- Android Studio / Android SDK installed
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` configured
- Android device connected with USB debugging enabled, or an emulator running

Command:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<phone-reachable-api>:3001 pnpm mobile:android:release
```

Expected evidence:

- Miaochat appears as an installed Android app.
- The app opens without a browser address bar or Expo Go shell.
- Login succeeds.
- Conversation list loads.
- At least one channel thread opens.
- Pending approval can be approved or rejected.
- At least one artifact preview card opens or renders.

## iOS Acceptance

Run this on the user's Mac with Xcode and the target iPhone configured for
development signing.

Command:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<phone-reachable-api>:3001 pnpm mobile:ios:release
```

Expected evidence is the same as Android: installed Miaochat app, login,
conversation browsing, approval decision, and artifact preview. Keep a short
screen recording for the demo package.

## Source References

- Expo prebuild and Continuous Native Generation:
  <https://docs.expo.dev/workflow/prebuild/>
- Expo local app compilation with release variants:
  <https://docs.expo.dev/guides/local-app-development/>
- Apple device run workflow:
  <https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device>
