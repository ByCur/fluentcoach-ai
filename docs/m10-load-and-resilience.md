# M10 pilot load and resilience

Synthetic fake AI/speech only; no paid calls. `pnpm test:load` starts five
concurrent practice sessions for one account, performs text and voice operations,
reads events, ends sessions, completes analysis/reports and reads progress.
It checks lost/duplicate turns, cross-session markers, a second account, exactly
five completions and deterministic text/voice minutes. Counts/latencies are
bounded operational metrics. Correctness is the gate; no arbitrary latency SLA.

Initial application-port measurement: 46 operations, 871.74 ms total,
p50 40.20 ms, p95 265.08 ms, errors 0. These exclude real Ollama/whisper latency,
WAN/browser rendering and production resource limits. They establish only local
pilot sanity, not production scalability. Final measurements are in validation.

`pnpm test:resilience` includes durable job restart/reconciliation, at-least-once
signed/transport duplicates, lost publication/commit acknowledgments, bounded
analysis timeout/invalid-output retry exhaustion, Ollama/whisper/Redis outages,
provider response validation/cancellation, deletion during analysis and blocked
plan selection, export/retention rollback and retry, interrupted tombstone replay
and idempotence. Redis loss leaves PostgreSQL product data intact. No outage
fabricates successful transcripts/reports, enables paid fallback or resurrects
deleted data. Failures return stable recoverable errors; repeated wakeups produce
one logical committed effect.

Operational playbook: inspect content-free job status/attempts/errors and service
readiness, repair provider/database/Redis access, then rerun reconcile or signed
wakeups. Leave DELETING accounts revoked if cleanup exhausts retries. Investigate
and explicitly requeue the privacy job through trusted database/operator access;
never reactivate the learner. Re-run failed retention batches after repair.
No production service was provisioned or tested; real device/provider and
production restore/backup/identity configuration remain M11 gates.
