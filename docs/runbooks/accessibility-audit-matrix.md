# CU-091 Accessibility Audit Matrix

**Audit date:** 2026-07-15  
**Scope:** Current private-beta mobile core surfaces and shared design-system primitives  
**Method:** Static code review, type checking, and focused unit/component tests

This matrix is implementation evidence, not a WCAG, App Store, VoiceOver, or platform
accessibility certification. Rows marked `Device required` must be completed on the named target in
the companion [accessibility checklist](./accessibility-checklist.md).

## Status key

- `Code verified`: the implementation contract was inspected and is covered by type checking and/or
  focused tests.
- `Device required`: static evidence exists, but behavior must be confirmed in a simulator or on a
  physical iOS device.
- `Phase Z`: deliberately deferred private-beta device validation or platform expansion.

## Shared primitives and navigation

| Surface                           | Code/test evidence                                                                                                                                                            | Remaining manual evidence                                                                  | Status                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| `Button`                          | Minimum height grows with text; role, label, hint, disabled, busy, and destructive-action hint are explicit. Pure tests cover state merging and destructive semantics.        | Largest Dynamic Type wrapping, contrast, and touch comfort in light/dark themes.           | Code verified; Device required |
| `IconButton`                      | New labelled 44×44 primitive; exposes disabled/selected/expanded state and destructive hint support. Used for icon-only onboarding rank controls and sheet close.             | VoiceOver name/action and touch target on device.                                          | Code verified; Device required |
| `Chip`                            | 44pt minimum, checkbox state when selectable, disabled state, visible text/check state; forced one-line truncation removed.                                                   | Large-type wrapping and rotor order.                                                       | Code verified; Device required |
| `SegmentedControl`                | Radiogroup/radio roles, selected state, labels/hints, 44pt minimum; segments wrap and labels are no longer forced to one line.                                                | Verify wrapping on compact phones at largest Dynamic Type and VoiceOver swipe order.       | Code verified; Device required |
| `NumberStepper`                   | Labelled decrement/increment controls, disabled bounds, 44pt targets, and an adjustable value contract.                                                                       | Adjustable gesture behavior and spoken units.                                              | Code verified; Device required |
| `TextField` / auth fields         | Visible label, disabled/error state, error hint and alert, scaling text, keyboard type and submit seams.                                                                      | Form traversal, software/hardware keyboard, secure-entry announcements, and error focus.   | Code verified; Device required |
| `BottomSheet`                     | Modal semantics, Android request-close, visible labelled close button, heading focus, optional return focus, reduced-motion animation branch, and keyboard-persistent scroll. | Initial/return VoiceOver focus, escape gesture, backdrop behavior, and keyboard avoidance. | Code verified; Device required |
| `Screen` / auth/onboarding scroll | Interactive keyboard dismissal and automatic keyboard insets added; headings marked semantically.                                                                             | Small-phone layout and keyboard traversal.                                                 | Code verified; Device required |
| App tabs                          | App-owned labels identify Home, Sleep, Recovery, Activity, Nutrition, and AI Coach as tabs; navigator owns selected state.                                                    | Confirm selected announcement and tab order with VoiceOver.                                | Code verified; Device required |

## Common state, privacy, provider, and error surfaces

| Surface                           | Code/test evidence                                                                                                                                                                           | Remaining manual evidence                                                        | Status                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| CU-090 `DataStatePanel`           | Loading role/label/live region/busy state, alert state, retry action, and optional focus-on-mount are tested.                                                                                | iOS announcement timing and focus order around retry.                            | Code verified; Device required                         |
| CU-090 `DataStatusBanner`         | Loading/error roles, labels, busy state, and live regions are explicit. Copy is grouped separately so retry remains independently reachable.                                                 | Verify announcements do not repeat excessively during refresh.                   | Code verified; Device required                         |
| Missing/stale/AI fallback states  | Text distinguishes required/optional, stale/current, cached/live, empty/error, and retry actions; status never uses color alone.                                                             | Read every mock state with VoiceOver and check Increase Contrast.                | Code verified; Device required                         |
| `ErrorBoundary` fallback          | Safe heading/state copy, assertive error semantics, focus-on-mount, labelled retry/Home actions; component test verifies safe recovery and focus call.                                       | Force a render crash and verify initial focus, retry remount, and Home recovery. | Code verified; Device required                         |
| Privacy & Data Controls           | Current/planned/provider states include text badges; deletion control is explicitly informational and says no request is sent; disclosure sheets restore focus. No destructive API is wired. | VoiceOver order and disclosure-sheet focus; largest-type layout.                 | Code verified; Device required                         |
| Google Health connection controls | Provider/badge/freshness have text meaning; authorize/refresh/disconnect expose busy/disabled state. Disconnect has an explicit provider label and destructive connection hint.              | Permission-flow focus, confirmation expectations, and live provider states.      | Code verified; Device required / Phase Z live provider |

## Core features and interactive content

| Surface                   | Code/test evidence                                                                                                                                                                                                     | Remaining manual evidence                                                                        | Status                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| Pressable Home/cards      | Shared widget cards are one labelled button with inner duplicate content hidden; score/status/reason are composed in spoken labels. Settings/edit and detail controls meet the practical target.                       | Rotor navigation, reading order, and compact-phone touch spacing.                                | Code verified; Device required |
| Score explanation         | Shared sheet uses hardened modal focus/close behavior; score, status, confidence, evidence, contributors, missing inputs, expanded state, and return focus have non-color text.                                        | VoiceOver heading focus, contributor expansion, and return to “See full breakdown.”              | Code verified; Device required |
| Check-in                  | Semantic heading; radio scale labels/selected state; notes field/error state; save exposes disabled reason and busy state.                                                                                             | Largest-type scale wrapping, keyboard dismissal, and success focus.                              | Code verified; Device required |
| Quick Add                 | Launcher-to-sheet return focus seam; category chips, stepper bounds, selected options, labelled fields, saving/error/success announcements, and disabled submit reasons.                                               | Form traversal for every category, keyboard avoidance, focus after category/back/save.           | Code verified; Device required |
| Auth/onboarding forms     | Semantic headings, labelled inputs/error hints, selected rows, labelled icon rank controls, reduced-motion entry, keyboard inset/dismissal.                                                                            | VoiceOver traversal, password behavior, largest type, and hardware keyboard.                     | Code verified; Device required |
| AI Coach composer         | Input/send have labels, disabled/busy state and waiting hint; screen uses `KeyboardAvoidingView`.                                                                                                                      | Keyboard traversal and focus after send/retry.                                                   | Code verified; Device required |
| AI messages and streaming | Thinking/error states use common announcements; response text exposes busy/in-progress state; evidence states confidence in text; follow-ups are labelled buttons. Auto-scroll disables animation under Reduce Motion. | Ensure token streaming does not over-announce; verify new-message navigation and evidence order. | Code verified; Device required |

## Charts and metric communication

| Surface                     | Accessible alternative and non-color meaning                                                                                                                                         | Remaining manual evidence                                   | Status                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------ |
| Sleep                       | Score has a spoken value/status; trend summary includes current/missing values; stage timeline names time range and every supplied stage duration. Missing stages use explicit text. | VoiceOver chart summary, legend order, largest-type labels. | Code verified; Device required |
| Recovery                    | Score/status and contributors use text; trend summaries include metric, time range, latest value, gaps, and baseline where supplied.                                                 | Compare spoken summary to visible values and test contrast. | Code verified; Device required |
| Activity                    | Movement/energy tiles have composed text; training-load bar summary includes latest, missing values, and labelled baseline. Highlight is not the sole carrier.                       | VoiceOver chart summary and Increase Contrast.              | Code verified; Device required |
| Nutrition                   | Macro values and percentages are grouped into spoken row labels; progress bars are decorative within those groups; missing/manual-estimate states are textual.                       | Largest-type rows and VoiceOver reading order.              | Code verified; Device required |
| Vitals                      | Each metric includes value/unit and baseline direction in words; unavailable source metrics are named; trend alternatives include latest and missing values.                         | Verify medical abbreviations/units are spoken intelligibly. | Code verified; Device required |
| Body composition / Home HRV | Trend alternatives include metric/range/latest/gaps; source and missing states are explicit.                                                                                         | VoiceOver summaries and compact-phone layout.               | Code verified; Device required |

## Deferred evidence

- Physical iPhone VoiceOver, Dynamic Type, Reduce Motion, Increase Contrast, light/dark contrast,
  keyboard, and focus-return results are not available from this static environment.
- Android TalkBack certification and platform parity are Phase Z/private-beta expansion work.
- Live Google Health authorization/sync state behavior requires credentials and a real device in
  Phase Z.
- Automated contrast tooling or a new accessibility dependency was not introduced by CU-091.
