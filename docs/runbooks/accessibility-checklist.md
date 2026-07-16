# Primis Accessibility Checklist

Use this checklist for CU-091 review and again during Phase Z/private-beta device validation. The
companion [audit matrix](./accessibility-audit-matrix.md) records the scoped code findings by
surface.

Passing static checks does **not** establish WCAG conformance, App Store accessibility compliance,
or correct VoiceOver behavior. Record the device, OS, app build, appearance, content-size category,
and assistive settings for every manual run.

## 1. Code and automated checks

These checks can be verified in source and reliable unit/component tests.

- [ ] Every interactive element has a role and meaningful action label.
- [ ] Icon-only controls use the shared `IconButton` or an equivalent labelled 44×44 target.
- [ ] Controls expose applicable `disabled`, `busy`, `selected`, `checked`, and `expanded` state.
- [ ] Destructive controls name the target and announce destructive intent; data-affecting actions
      require a separate confirmation review.
- [ ] Pressable cards are one coherent accessibility element and do not double-read descendants.
- [ ] A container does not hide an interactive retry, dismiss, or follow-up child.
- [ ] Loading and refresh states use a progress/busy contract; errors use alert semantics and keep
      retry independently reachable.
- [ ] Status, confidence, provider state, selected state, and missing data have text or icon meaning
      in addition to color.
- [ ] Critical labels are not forced to one line; fixed-height controls can grow with font scaling.
- [ ] Forms expose visible labels, input labels, errors, keyboard/return-key intent, disabled reasons,
      and stable drafts during retries.
- [ ] Charts expose one concise alternative containing metric, time range, unit, latest/state,
      missingness, and baseline/context where available.
- [ ] Decorative chart marks and duplicate content are hidden when a composed alternative is used.
- [ ] AI streaming exposes busy/in-progress state without logging or announcing hidden context.
- [ ] Animation callers pass the OS reduced-motion value; pure resolver tests cover the reduced
      branch.
- [ ] `pnpm --filter @primis/design-system test`
- [ ] `pnpm --filter @primis/design-system typecheck`
- [ ] `pnpm --filter @primis/mobile test`
- [ ] `pnpm --filter @primis/mobile typecheck`
- [ ] `pnpm --filter @primis/mobile lint`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm format:check`

## 2. Simulator or device checks

Run on the smallest supported phone and one standard/large phone in light and dark appearance.

- [ ] Tap targets are comfortably operable and at least the intended 44×44 points.
- [ ] No control overlaps another control at compact width.
- [ ] Long text wraps without clipping, hiding the action, or horizontal scrolling.
- [ ] Loading, stale, empty, provider-unavailable, provisional, missing, cached-AI, and error mock
      states render without layout shifts that hide recovery actions.
- [ ] Check-in, every Quick Add category, auth, and onboarding remain usable with the software
      keyboard open.
- [ ] Return/Next/Done advances where intended; multiline fields do not submit unexpectedly.
- [ ] Keyboard dismissal does not discard drafts.
- [ ] Score, privacy, and Quick Add sheets keep content reachable and expose a visible close control.
- [ ] Connection authorize/refresh/disconnect controls clearly communicate pending and disabled
      state.
- [ ] Light/dark status text, borders, focus indicators, disabled controls, chart marks, and overlays
      remain distinguishable. Record Increase Contrast separately below.

## 3. VoiceOver checks (iOS)

Enable VoiceOver before opening the app, then repeat with VoiceOver enabled while the app is open.

- [ ] Swipe order follows the visual/task order on every core screen; hidden/decorative elements do
      not interrupt it.
- [ ] Headings are available through the rotor and identify screen/section hierarchy.
- [ ] Tabs announce label, tab role, and selected state in the locked app order.
- [ ] Home and other pressable cards read one useful summary followed by the action hint.
- [ ] Buttons, icon buttons, chips, radio options, steppers, switches, and expandable contributors
      announce their applicable state.
- [ ] On opening a sheet, focus moves to its heading; the escape gesture and visible Close both work;
      after dismissal focus returns to the launcher.
- [ ] A forced render error moves focus to the safe error message; Retry and Home recover without
      exposing raw error text.
- [ ] Loading/refresh/save and error announcements occur once at a useful time and do not trap focus.
- [ ] AI Coach announces thinking/in-progress/error/completion without reading every token or moving
      focus away from the user.
- [ ] Evidence chips read statement plus confidence; follow-up questions remain separate buttons.
- [ ] Chart summaries match visible metric, range, units, latest value, missing points, and baseline;
      sleep stages name each stage duration.
- [ ] Provider states announce provider name, current state, freshness, and available action.
- [ ] Privacy deletion content is announced as informational and does not imply that a request was
      submitted or scheduled.

## 4. Dynamic Type checks (iOS)

Run at the largest accessibility content-size category, then spot-check one intermediate category.

- [ ] Button, chip, segmented-control, tab, and sheet-close labels are complete and operable.
- [ ] Screen titles, score values/status, provider states, errors, and retry actions do not clip.
- [ ] Segmented scales wrap without changing option meaning or order.
- [ ] Metric units stay associated with values; missing markers remain understandable.
- [ ] Cards reflow vertically without covering or pushing critical actions off an unreachable area.
- [ ] Check-in and Quick Add remain completable using scroll plus keyboard.
- [ ] AI messages, evidence, composer, and send control remain readable and reachable.
- [ ] Chart alternatives remain available even if visual axis/legend labels become crowded.

## 5. Reduce Motion checks (iOS)

Enable Settings → Accessibility → Motion → Reduce Motion.

- [ ] Auth, onboarding, Home, Sleep, Recovery, Activity, Nutrition, and Vitals avoid custom entrance
      translation/scale effects.
- [ ] Bottom sheets appear without custom fade/slide motion and remain understandable.
- [ ] AI Coach auto-scroll does not animate.
- [ ] Progress and chart content does not depend on animation to communicate completion or state.
- [ ] Native navigation remains usable with the platform's chosen transition behavior.

## 6. Increase Contrast and non-color checks (iOS)

Enable Settings → Accessibility → Display & Text Size → Increase Contrast and repeat in light/dark.

- [ ] Selected/checked controls still have a spoken state and visible shape/text cue.
- [ ] Score and provider states include words, not only semantic colors.
- [ ] Error, caution, missing, provisional, stale, and cached states remain distinguishable.
- [ ] Charts communicate state/baseline/missingness through labels or summaries, not color alone.
- [ ] AI evidence confidence includes text labels.
- [ ] Destructive controls remain identifiable without relying on red.

## 7. Manual result record

### CU-091 environment result (2026-07-15)

- iOS 18.3 and an iPhone SE (3rd generation) simulator booted successfully.
- No Primis dev client or Expo Go app was installed in the simulator.
- `expo run:ios` stopped before native generation because the checked-in placeholder bundle
  identifier is intentionally not a valid Apple bundle identifier.
- No tracked or generated native files were created. VoiceOver, Dynamic Type, Reduce Motion,
  Increase Contrast, keyboard, contrast, and modal focus behavior therefore remain unverified and
  must use the Phase Z record below.

Changing the placeholder identifier is outside CU-091 and the Phase J guardrails; do not replace it
solely to make this checklist appear complete.

Copy this block into the PR or private-beta test artifact for each run:

```text
Date/time:
Tester:
Device or simulator:
iOS version:
App commit/build mode:
Appearance/accent:
Content-size category:
VoiceOver:
Reduce Motion:
Increase Contrast:
Keyboard tested:
Surfaces completed:
Findings (include screen + exact control/order):
Pass / pass with findings / blocked:
```

## 8. Known Phase Z/private-beta limitations

- CU-091 static/unit evidence cannot certify VoiceOver focus order, pronunciation, gesture behavior,
  target comfort, real contrast, or layout at every system setting.
- A physical iPhone run is required for final modal focus/return focus, VoiceOver announcements,
  largest Dynamic Type, Reduce Motion, Increase Contrast, keyboard, and haptic-independent state.
- Live Google Health authorization and sync require Phase Z credentials and real-device validation.
- Android TalkBack and full cross-platform parity remain deferred; do not describe the iOS-focused
  pass as Android certification.
- Re-test this checklist after CU-092 profiling work to ensure instrumentation preserves labels,
  order, reduced-motion branches, and chart alternatives.
