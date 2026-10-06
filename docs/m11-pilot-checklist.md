# M11 one-learner pilot and manual device gates

All boxes are pending. M11 remains incomplete; passing synthetic tests does not
open admission. Store signed operator/evidence records privately, with references
in release notes, not identifying learner material in git.

- [ ] Resolve ADR 0017 secure zero-cost AI/voice, Redis at-rest and independent
  ledger storage blockers through reviewed design and proof; no paid resource,
  billing, Gemini fallback, exposed developer PC or deployed worker.
- [ ] All earlier CI and five M11 CI gates green on the exact SHA; tested immutable
  API digest and frontend checksum recorded; actual previous-image rollback on
  forward schema proved, including privacy/deletion and pending jobs.
- [ ] Each environment has independent DB roles/data, Redis credentials/resources,
  Auth0 tenant/app and QStash key/destination boundary. Confirm actual plan after
  trials expire, no card, no upgrades/paid fallback, region/data terms/quotas and
  privacy disclosures; distinguish evidence from public pricing documentation.
- [ ] Verify direct migration role/one-run lock, durable drain counts, lease expiry,
  cold startup/SSE cursor recovery, quota pending behavior and Redis session loss
  in an actual staging environment. Record real contacted URLs and timestamps.
- [ ] Protected encrypted dump destination and independent current tombstone
  ledger exist, expiry <=30 days enforced, restore/replay proved, RPO/RTO measured,
  owner/key recovery tested and free alerts received by responsible operator.
- [ ] Adult/consent/authority facts reviewed with the learner; Spanish versioned
  local pipeline/browser TTS disclosure accepted. Explain provider logs, product
  export/deletion, 90-day retention, backup expiry and withdrawal accurately.
- [ ] Auth0 Free invitation manually limited to one learner; all public/social
  signup disabled, uninvited identity rejected, exact callback/logout and PKCE/
  state/nonce verified, session expiry and recent auth before deletion verified.
- [ ] Real local Ollama and multilingual whisper.cpp smoke, installed/licensed
  models, ffmpeg conversion, Spanish “No entiendo”, realistic latency/memory and
  8 MiB/30-second behavior tested. Cloud voice deployment proof separately
  required; text alone does not remove the voice blocker.
- [ ] Explicit named operator production authorization binds the exact immutable
  identity and expiry; protected environment/manual hosting action completed only
  after blockers resolved. Real production smoke subsequently recorded.
- [ ] Invited learner completes voice/text → final transcript → validated report
  → evidence/priority → vocabulary review → accepted plan/activity → progress.
  Check export/isolation/deletion without retaining raw audio. Record observations
  with consent and minimal non-identifying feedback; no invented pilot success.
- [ ] Agree pause/withdrawal/contact process, operator availability, one-learner
  limits and no availability SLA. Review before expanding access. No M12 work.

## Manual device/accessibility matrix

Run the full invited path on Windows Chromium + NVDA, macOS Safari + VoiceOver,
iOS Safari + VoiceOver, and Android Chrome + TalkBack where available. Record OS,
browser, device, date, permission state and outcome; unavailable devices stay
pending, not passed. Automated axe scope is in [M10](m10-accessibility.md).

- [ ] Keyboard-only focus order, visible focus, dialog/error focus/restoration,
  disabled control state and accessible names; profile/goals/consent/privacy.
- [ ] Startup, reconnect/exhaustion, report pending, field errors, deletion and
  microphone status announced once meaningfully; captions readable throughout.
- [ ] Real microphone allow/deny/revoke/missing-device; WebM/Opus and Safari MIME,
  conversion, quiet/Spanish utterance, browser tab suspension, network disconnect
  and lost audio acknowledgement. Never duplicate/resend voice invisibly.
- [ ] TTS voice missing/network voice, mute/stop/rate, captions without TTS,
  interruption/navigation stop, audio privacy disclosure and no recording storage.
- [ ] Touch targets, portrait/landscape, 200%/400% zoom, high contrast, reduced
  motion, readable Spanish/English copy, no color/audio-only instruction.
- [ ] Real teaching/natural mode corrections and useful Spanish help at A1–B2;
  no pronunciation score or certified CEFR claim. Recovery keeps the same session.
