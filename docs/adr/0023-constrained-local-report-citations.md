# ADR 0023 — Constrain local report citations before generation

Status: accepted. Four capped synthetic A1–B2 live cases passed on 2026-10-30;
human educational review remains pending.

## Context

The packaged local text and voice pipeline works, but a real llama3.2:3b smoke
produced invalid evidence offsets. The unchanged application validator rejected
the reports. Longer deadlines alone cannot resolve incorrect citation arithmetic.

## Decision

Version the local prompt independently as `ollama-analysis-v1`. Its generation
grammar is a strict subset of report-v1: one strength, at most one correction,
short Spanish fields and one citation per finding. Each permitted citation is a
complete immutable tuple of learner sequence, exact quote and UTF-16 offsets,
supplied through JSON Schema `oneOf`/`const`. The model selects a tuple rather
than calculating indices. Tutor/help turns and help requests remain excluded.
Quotes beyond report-v1's 2,000-unit cap use source-contiguous bounded excerpts
without splitting surrogate pairs. Quoted learner strings remain untrusted data.

No model output is repaired, fabricated or accepted by this grammar alone.
The existing application schema/evidence validator, account ownership checks,
deletion epochs and transactional commit remain authoritative. A provider that
ignores the grammar still fails validation. Gemini retains analysis-v3 and its
existing schema/prompt; no provider fallback is added.

## Compatibility and validation

Report-v1, the rubric and database schema are unchanged. Existing reports remain
readable, and new provider metadata records the distinct local prompt version.
No migration or data rewrite is needed. Reverting the prompt may restore citation
failures; never relax the application validator as a rollback workaround.

Network-free tests cover strict citation tuples, Unicode boundaries, help/tutor
exclusion, forged references and the real application validator. The explicit
`pnpm eval:ollama:reports -- --live --max-calls 4` suite uses four existing
synthetic A1–B2 fixtures, at most four local calls and 120 seconds per call, with
no paid service or raw content in artifacts. A narrow batch can select an offset.
Record the actual live result before declaring the delivery checked. Structural
success does not establish educational usefulness; human review remains pending.
