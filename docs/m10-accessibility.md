# M10 accessibility validation scope

`pnpm test:a11y`: @axe-core/playwright 4.10.2, Chromium, WCAG 2 A/AA,
2.1 A/AA and supported 2.2 AA rules. Serious/critical findings block CI; no
violation allowlist. Three tests cover profile/goals/consent onboarding, practice
selection, text conversation, fake voice controls, report, recurring issues,
vocabulary/review, plan/progress, privacy/export and deletion completion.
Keyboard Tab and visible focus are checked. Existing form labels, named regions,
button names, hierarchy, status/live announcements and text metrics remain.
Focus-visible styling extends to links; buttons expose disabled state.
Deletion confirmation is deliberate and all learner UI is cleared on revocation.
Voice always retains text; browser TTS has visible mute/stop/rate/voice controls.

Local result: 3 tests passed, zero serious/critical supported violations across
all tested states. This is automated scope, not WCAG certification or proof of
complete keyboard/device/screen-reader accessibility. Before M11: manually check
complete keyboard focus order and restoration, live/error/microphone announcements
with NVDA/VoiceOver, actual microphone permission states, mobile/touch/zoom/high
contrast, captions/TTS stopping and complete accessible names under each locale.
