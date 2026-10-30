# ADR 0022 — Local Windows validation package

Status: accepted for local technical validation; real learner admission pending.

## Context

The requested Windows handoff must preserve PostgreSQL learner state, Redis
sessions and application-owned AI ports. A native executable alone cannot run
the existing distributed services. Cloud release remains blocked under ADR 0017.

## Decision

Distribute a ZIP containing only committed build inputs, three Windows launchers
and a dedicated Compose project. Docker Desktop/WSL 2 is an explicit initial
prerequisite; Node/pnpm and AI host installations are unnecessary. Installation
builds the existing application images and a source-pinned CPU whisper.cpp image,
then explicitly downloads llama3.2:3b and multilingual Whisper base. Daily opening
uses the installed images without builds or pulls, waits for dependency health,
checks the proxied API and opens localhost:17880. Errors remain visible.

Only the web port binds to IPv4 loopback. Database/cache/provider ports are not
published. The launcher rejects remote Docker contexts. It explicitly selects
an empty Compose environment file and fixed providers, never a developer `.env`.
Container log persistence is disabled, and Whisper uses a temporary memory
filesystem for uploaded/conversion audio. Browser TTS retains the disclosure
from ADR 0011. No provider keys or paid fallback are introduced.

The package uses existing **development synthetic identity**, accurately labelled
as a demo. It does not create an invitation/authentication system, weaken cloud
release checks or complete M11. Anyone using the Windows session can access that
local account. Device performance, microphone/TTS and the applicable privacy,
recovery and learner-admission checklist still require evidence before real data.

## Compatibility and rollback

Existing application migrations apply through the existing one-shot migrate
image. No new schema is introduced by packaging. The separate desktop project
uses persistent volumes and never imports developer data. Closing uses `down`
without `--volumes`; copying the ZIP does not copy learner state. Reinstalling
reuses data/models. Replacing the source folder is not a database rollback;
schema rollback limits and restore/deletion rules remain those of the existing
migrations and M10 runbook. Do not downgrade images across incompatible schemas.

## Verification

Validate Compose rendering, actual image builds, clean installation, repeated
opening, real local-model synthetic smoke, and stopping/reopening with persisted
synthetic state. Run common and affected regression gates. Keep manual/pilot
checks pending until observed; no automated test establishes educational quality.
