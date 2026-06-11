# apps/mobile — Primis React Native App

React Native + Expo Dev Client application for Primis.

> **Status:** CU-015 placeholder configuration only. No real credentials are present.
> See the Phase Z setup checklist below before running real EAS builds.

---

## Local Development

### Prerequisites

- Node.js 20+ and pnpm
- Xcode (for iOS simulator/device builds)
- `eas-cli` installed globally: `npm install -g eas-cli`
- Expo account (for EAS builds — not required for local simulator builds)

### Start the dev server

```bash
# From the repo root
pnpm --filter @primis/mobile start

# Or from this directory
pnpm start
```

This starts the Metro bundler with `expo start --dev-client`. Connect a
device running an Expo Dev Client build, or use an iOS simulator.

### Type-check

```bash
# From the repo root
pnpm --filter @primis/mobile typecheck

# Or from this directory
pnpm typecheck
```

---

## EAS Build Profiles

Three build profiles are declared in `eas.json`:

| Profile       | Distribution | Update channel | Purpose                                   |
| ------------- | ------------ | -------------- | ----------------------------------------- |
| `development` | internal     | `dev`          | Dev Client build for local/team testing   |
| `preview`     | internal     | `preview`      | Ad-hoc/TestFlight-adjacent review builds  |
| `production`  | store        | `production`   | App Store submission builds               |

### Running a build (after Phase Z setup)

```bash
# Development build (requires real credentials)
eas build --profile development --platform ios

# Preview build
eas build --profile preview --platform ios

# Production build
eas build --profile production --platform ios
```

> Do not run `eas build` until Phase Z credentials are provisioned.
> Running against placeholder values will fail credential validation.

---

## EAS Update Channels

OTA (over-the-air) JavaScript updates are gated by the native `runtimeVersion`
policy (`appVersion`). A JS bundle published to `production` will only be
delivered to native builds whose `version` field matches.

| Channel      | Targets                              |
| ------------ | ------------------------------------ |
| `dev`        | Development builds                   |
| `preview`    | Preview / internal distribution      |
| `production` | App Store / production native builds |

### Publishing an update (after Phase Z setup)

```bash
eas update --channel dev --message "describe the update"
```

---

## Phase Z Setup Checklist

> **Phase Z is the manual provisioning phase.** None of the steps below are
> automated or scripted. Complete them in order before running real EAS builds.

### 1. Create an Expo / EAS project

- [ ] Log in: `eas login`
- [ ] Initialize the project: `eas init` (or create via [expo.dev](https://expo.dev))
- [ ] Copy the generated UUID and replace `PLACEHOLDER_EAS_PROJECT_ID` in
      `app.config.ts` (both `extra.eas.projectId` and `updates.url`)

### 2. Apple Developer account

- [ ] Enroll in the Apple Developer Program ($99/year)
- [ ] Note your Apple Team ID from [developer.apple.com](https://developer.apple.com)
- [ ] Register an App ID with a real bundle identifier (e.g. `com.primis.app`)
- [ ] Replace `PLACEHOLDER_BUNDLE_ID` in `app.config.ts` → `ios.bundleIdentifier`

### 3. App Store Connect

- [ ] Create the app record in App Store Connect
- [ ] Note the ASC App ID (numeric, e.g. `1234567890`)
- [ ] Replace `PLACEHOLDER_ASC_APP_ID` in `eas.json` → `submit.production.ios.ascAppId`
- [ ] Replace `PLACEHOLDER_APPLE_ID` with the Apple ID used for App Store Connect
- [ ] Replace `PLACEHOLDER_APPLE_TEAM_ID` with the 10-character team ID

### 4. EAS credentials

- [ ] Run `eas credentials` to provision distribution certificates and
      provisioning profiles through the EAS managed credentials workflow
- [ ] Alternatively, upload your own certificates via `eas credentials --platform ios`

### 5. Android (deferred to Phase 3+)

- [ ] Replace `PLACEHOLDER_ANDROID_PACKAGE` in `app.config.ts` → `android.package`
      with the real application ID (e.g. `com.primis.app`)
- [ ] Create a Google Play Console listing and upload a signed build

### 6. Verify

```bash
eas build --profile development --platform ios --dry-run
```

---

## Environment Variables

App-level environment variables are passed via `eas.json` `env` blocks per
build profile. Secrets that must not appear in the JS bundle are injected at
build time via EAS Secrets:

```bash
eas secret:create --scope project --name MY_SECRET --value "..."
```

Never commit real secrets to this repo. See `.ai-agent-instructions.md §Rule 5`.

---

## Architecture Context

- Framework: React Native + Expo Dev Client (Expo Go is **not** used; native
  modules require a development build — see `EXT-RN-001` in the Technical
  Architecture Document)
- Navigation: Expo Router (file-based, typed routes enabled)
- Bundler: Metro via `@expo/metro-config`
- Tests: Vitest + `@testing-library/react-native`
