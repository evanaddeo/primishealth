# HealthKit Phase Z Live-Validation Handoff

**Status:** CU-097 automated scaffold complete; native build and physical-device validation pending  
**Feature flag:** `EXPO_PUBLIC_HEALTHKIT_ENABLED=false` by default  
**Provider code:** `healthkit` (ADR-001)

## Compatibility evidence recorded by CU-097

| Item                   | Validated scaffold input                                                       | Remaining live gate                                                           |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Expo / React Native    | Expo 56.0.11, React Native 0.86.0, React 19.2.7                                | Re-run after the repository's separate Expo dependency-alignment work         |
| Architecture           | React Native 0.86 requires the New Architecture                                | Confirm generated iOS project and Nitro autolinking in a clean build          |
| HealthKit package      | `@kingstinct/react-native-healthkit` 14.0.2, MIT, published 2026-06-05         | Inspect release notes/security notices again at build time                    |
| Native runtime         | `react-native-nitro-modules` 0.36.1, MIT, published 2026-06-30                 | Confirm CocoaPods resolution and device launch                                |
| Package peers          | React >=19, React Native >=0.79, Nitro >=0.35                                  | Confirm exact lockfile is used by the native build                            |
| Security audit         | No advisory path involves HealthKit or Nitro                                   | Existing Expo `xcode > uuid@7.0.3` moderate advisory remains separately owned |
| Expo support           | Package supplies a config plugin and requires a custom development client      | Build a fresh development client; Expo Go is unsupported                      |
| iOS configuration      | Introspection produces HealthKit entitlement + `NSHealthShareUsageDescription` | Inspect the generated entitlements and Info.plist in the built project        |
| Write/background scope | `NSHealthUpdateUsageDescription=false`; `background=false`                     | Confirm neither write-purpose nor background-delivery appears after prebuild  |
| Android/CI             | Android and Node factories never import the iOS package                        | Run an Android build on a configured host                                     |

The selected package's config plugin enables the base HealthKit entitlement even while the runtime
feature flag is off. That entitlement is required to compile the native shell; the flag and explicit
button action prevent runtime permission requests. Changing libraries, enabling write access,
enabling background delivery, or mapping an additional read type requires the Phase K approval/ADR
path.

## Approved read boundary

CU-097 defines weight, body fat, lean mass, HRV RMSSD, resting heart rate, sleep/stages, and workouts
as provider-neutral capabilities. The current Apple mapping intentionally leaves `hrv_rmssd`
unavailable because Apple HealthKit's public quantity identifier is SDNN; do not relabel SDNN as
RMSSD. Nutrition, writes, clinical data, observer queries, anchors, and background delivery are not
approved.

## Clean native-build checklist

Run only after Phase Z supplies an approved bundle identifier/signing path and the Expo dependency
alignment blocker in `testflight-release.md` is resolved:

- CU-097 attempted `expo run:ios`; Expo rejected the intentional `PLACEHOLDER_BUNDLE_ID` before
  native generation.
- CU-097 attempted `expo run:android`; Expo rejected the intentional
  `PLACEHOLDER_ANDROID_PACKAGE` before native generation.
- An Android Metro export also stopped at the pre-existing missing `react-native-worklets/plugin`
  dependency recorded by the Phase J Expo alignment blocker, before platform bundle resolution.
- Expo config introspection did succeed and confirmed the base HealthKit entitlement/read-purpose
  text with no write-purpose or background-delivery entry.

```bash
pnpm install --frozen-lockfile
pnpm --filter @primis/mobile exec expo config --type public --json
pnpm --filter @primis/mobile exec expo config --type introspect --json
pnpm --filter @primis/mobile ios
pnpm --filter @primis/mobile android
```

- [ ] Use Xcode/Expo versions supported by Expo SDK 56 and record exact versions.
- [ ] Confirm CocoaPods resolves the pinned HealthKit and Nitro packages.
- [ ] Confirm the generated entitlements contain `com.apple.developer.healthkit=true` and no
      background-delivery entitlement.
- [ ] Confirm Info.plist contains the approved read-purpose string and no update/write-purpose key.
- [ ] Rebuild and install the development client; do not test through Expo Go.
- [ ] Launch with the flag false and confirm no permission sheet appears at startup, login, screen
      render, or connection-screen render.
- [ ] Launch with the flag true and confirm the permission sheet appears only after tapping
      **Connect Apple Health**.
- [ ] Confirm Android builds and opens without any HealthKit permission or native-module load.

## Physical-iPhone validation

Use a dedicated test account/device and do not commit, log, screenshot into Git, or place real
samples in test fixtures.

- [ ] Validate HealthKit unavailable/restricted behavior and protected-data edge cases.
- [ ] Validate first request, repeated request, partial category selection, settings changes, and
      request cancellation.
- [ ] Confirm the UI never calls a missing read type “denied”; use requested,
      limited-or-no-data, unavailable, or error language as applicable.
- [ ] Validate source UUID stability, units, time zones, sleep wake-date attribution, stage values,
      workout identity, and query bounds.
- [ ] Validate weight, body fat, lean mass, resting heart rate, sleep, and workout mappings with
      product/privacy review; keep HRV RMSSD unavailable until a semantically correct source exists.
- [ ] Confirm no sample values, native error detail, authorization payloads, or source identifiers
      enter telemetry or runtime logs.
- [ ] Confirm no raw samples are persisted in MMKV, SQLite, AsyncStorage, or other general mobile
      storage by this scaffold.

CU-098 may reuse the canonical read types, stable `sourceRecordId` requirement, feature flag,
adapter boundary, and authorization semantics. It must add authenticated upload separately and must
not treat this runbook as permission to transmit data.
