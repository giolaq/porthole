# Movie shelf for the Porthole collaboration demo

This Expo 56 Android TV app presents a horizontal row of movie cards. Each
card's `testID` and `accessibilityLabel` equal its title, so Porthole's
semantic UI tools can find it consistently. The Android package is
`com.giolaq.rntvosapp`.

## Build and install on a TV AVD

Install Node.js 20.19 or newer and the Android SDK. Create and boot an Android
TV AVD in Android Studio, then run from this directory:

```sh
npm install
npx expo run:android --device
```

Select the running TV emulator if Expo asks. This command builds and installs
the app and starts Metro; leave Metro running for this debug build. Expo's
[local build guide](https://docs.expo.dev/guides/local-app-development/)
documents `run:android` and the `--device` selector. The app uses the
[Expo 56 SDK](https://docs.expo.dev/versions/v56.0.0/).

## Open it through Porthole

From the repository root, after building Porthole, start its server against
the same running TV AVD:

```sh
npm run build
node packages/porthole/dist/cli.js start <TV_AVD>
```

In another terminal from the repository root, use the local CLI:

```sh
node_modules/.bin/porthole launch com.giolaq.rntvosapp
node_modules/.bin/porthole focus-on "Interstellar"
node_modules/.bin/porthole focused -q
```

The browser shows the TV stream and remote. For the complete human and agent
walkthrough, see [the demo script](../../docs/demo/human-agent-demo.md).
