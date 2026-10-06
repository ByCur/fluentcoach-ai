# M12 discovery — Exam practice specification

Status: **Future specification; no exam mode implemented or authorized.**
Date: 2026-10-06. Requirement: SPEC F15; decision: [ADR 0018](adr/0018-practice-only-exam-evaluation.md).
Document review and outstanding specialist gates: [M12 discovery](m12-discovery.md).
All requirements below apply only to a separately accepted future plan.

## Candidate families and first slice

| Candidate | Possible practice coverage | Admission constraints |
| --- | --- | --- |
| Original general-English tasks inspired by CEFR A1–B2 learning objectives | Short written responses and transcript-grounded speaking responses | Recommended first slice; original prompts and an independently authored practice rubric; selected learning level is not an assessed CEFR level |
| Cambridge English A2 Key, B1 Preliminary, B2 First | Selected writing and speaking task formats | Current exam variant, task/rubric rights, trademarks and qualified reviewer must be verified; no copied past papers, examiner recordings or official score claim |
| IELTS Academic / General Training | Selected writing and speaking tasks | Variant-specific task/rubric mapping, licensing and evaluator review; initial A1–B2 product does not establish coverage of higher-level performance |
| TOEFL iBT | Selected integrated writing/speaking tasks | Date/version-specific format, rights for source text/audio and qualified review; do not assume an old task format remains current |
| Pearson PTE Academic / other digital English exams | Selected short-response tasks | Format/rights and modality feasibility review; proprietary automated scoring cannot be reproduced or claimed equivalent |
| School, university or locally authored assessments | Original tasks explicitly supplied with permission | Institution-specific rights and rubric review; no consequential grading or school-record integration |

This is a shortlist, not a supported-exam catalog or a verified description of
current official formats. No branded family is selected for implementation.
Reading/listening tasks are later candidates only with licensed/original passages,
accessible media and author-reviewed answer keys. Cambridge/IELTS/TOEFL/PTE names
are descriptive references; approval to use marks or reproduce content is not
inferred. No affiliation, certification, admissions prediction or pass guarantee.

## Session and feedback contract

The proposed first slice is one original task followed by feedback on an explicitly
submitted response. Task instructions disclose target learning level, allowed
help, modality and whether a timer is advisory. They must distinguish unassisted
practice from assisted/coached practice. Spanish help, interrupted attempts,
timeouts and retries remain available as learning support and are marked in the
feedback context; they cannot count as unassisted exam evidence. Natural
Conversation and Teaching Mode remain existing tutor modes, not hidden exam modes.

Feedback says **“Practice feedback — not an official exam score”** before any
assessment summary (Spanish-first wording requires review). It gives a small
number of supported observations, uncertainty and a next practice action. It
never awards an official band, scaled score, CEFR certificate, pass/fail,
percentile or likelihood of admission. Existing tutor reports are not automatically
converted to exam assessments. A later proposal for a score estimate needs a new
calibration/rights decision and evidence; it is outside the first slice.

## Independently authored rubric

Version the task, rubric, prompt, output contract, evidence rules and model before
use. Proposed working identifier `exam-practice-rubric-v1` is a document label,
not a runtime schema introduced by M12. Review these internal anchors with a
qualified English-assessment reviewer before implementation acceptance:

| Dimension | Evidence and bounds |
| --- | --- |
| Task fulfillment | Compare the response with the original task's explicit requirements; identify answered/missing elements, not correctness of the learner's personal experiences |
| Organization/coherence | Cite relationships and sequencing within the submitted response; do not infer spoken delivery, confidence or hesitation from punctuation |
| Language range/appropriateness | Cite vocabulary/structures suited to this task; short answers do not prove a broad language repertoire |
| Language accuracy | Quote an actual learner span and justify a correction; dialect/acceptable variants must be included in reviewer guidance |

Each dimension has internal anchors: 0 = assessable response does not yet address
the criterion; 1 = partially addresses it with substantial limitations; 2 =
mostly addresses it with localized limitations; 3 = addresses it consistently
within this task. Reviewer examples must define boundaries per task. An empty,
truncated, untrustworthy or out-of-scope response is **insufficient evidence**,
not 0. Internal anchors organize fixtures; the first learner-facing slice uses
qualitative feedback, with no aggregate numeric score or official scale mapping.

Reading/listening correctness, if later admitted, uses reviewed answer keys and
accepted alternatives, independent of model opinion. The current text/transcript
path cannot assess pronunciation, accent, intonation, speech rate or audible
fluency. No raw-audio retention or acoustic evaluator is proposed. ASR ambiguity
requires abstention on affected dimensions or learner correction/resubmission,
never treating uncertain transcription as a learner error. A transcript response
can support language/task observations, with an explicit modality limitation.

## Evidence and invalidation

A future accepted observation must identify the owning learner, attempt, task and
rubric versions, response revision, dimension, exact response span and explanation.
Task-fulfillment omissions cite the task requirement and reviewed whole-response
coverage rather than inventing a missing quote. Spans must resolve against the
submitted authoritative revision and survive exact-text, ownership and role
validation. Tutor examples, help requests, task passages and another learner's
responses are not learner-performance evidence. Quoted text is untrusted input,
never an instruction to the evaluator.

Validate every proposal outside the model: permitted dimension/anchor, bounded
output, reference membership, exact quotes, current revision and account-active
state. Invalid/mixed evidence rejects the affected evaluation rather than
publishing an apparently complete assessment. Source deletion, retention,
resubmission or rubric/task retirement removes affected derived feedback from
availability; no stale quote or copied assessment may bypass source eligibility.
At commit and delivery, recheck account deletion fencing. Do not overwrite the
learner's self-selected CEFR or feed practice anchors into recurring priorities,
plans or shared views without a separately reviewed integration decision.

## Content rights and provenance

Every proposed task pack and fixture needs a provenance inventory before use:
original author or rights holder, source/edition/date, jurisdiction/territory,
license text and version, permission evidence, attribution, permitted adaptation,
redistribution, commercial use, model processing, storage, retention and expiry.
Reviewer-created rubrics need provenance too. Public download, a published rubric,
a search snippet or learner upload does not establish permission to copy/adapt.
Do not scrape exam banks, use leaked papers, unlicensed audio/images or memorize
exam items through prompts. Do not accept proprietary learner-uploaded exam
material in the first slice. Model-generated prompts are not presumed rights-free:
review similarity/provenance and reject recognizable reproduction.

Prefer new, human-reviewed synthetic tasks. Do not copy official rubric wording
or store restricted source material in fixtures, logs, prompts or repository
history. Link to official rights/format references only after dated verification;
this discovery does not assert any external license has been checked or granted.
Expired/revoked rights disable affected tasks and evaluations; historical feedback
retention, required notices and lawful export handling need a rights decision.
No paid content/provider is enabled under the current free-only policy.

## Evaluation design and acceptance gates

The pre-implementation [fixture matrix](m12-test-matrices.md#exam-evaluation-fixture-matrix)
defines 48 core cases and 20 adverse cases using wholly synthetic responses.
Each fixture records task/rights provenance, learning target, modality, assistance,
expected per-dimension anchors or accepted ranges, allowed evidence spans,
abstentions, rejected claims and reviewer rationale. Version expected outcomes
separately from prompts/models. Use positive and negative examples, boundary
anchors, acceptable dialects and ASR ambiguity; avoid exact generated-prose tests.

CI will use a deterministic fake evaluator for policy/evidence contracts. This
proves validation behavior, not exam validity. A future opt-in, cost-capped local
model evaluation uses the admitted pedagogical subset of the same pack, three
runs per case per model/prompt change, with independent assessment review. Cases
blocked on rights/ownership/input validation must fail before model inference.
Preserve task/response split and hold out a reviewed subset from prompt tuning. Report dimension disagreement,
abstention, variability and limitations; a pedagogical gate cannot be satisfied
by the fake evaluator. There is no live evaluation or new script in M12.

Release-critical policy/evidence/isolation cases require 100% expected outcomes,
with zero unsupported official claims, fabricated evidence or resurrection.
For pedagogy, a proposed minimum is 90% reviewer-accepted useful feedback with
no critical misleading assessment, measured per task family and modality rather
than only pooled. This provisional threshold, anchor tolerances, reviewer
agreement and sample adequacy require explicit approval before implementation
acceptance; no calibration claim follows from passing a small synthetic set.

## Risks, gates and follow-up

Risks: format drift, unauthorized content, biased dialect/level evaluation,
ASR-induced errors, hallucinated evidence, overstated readiness, coached attempts
presented as independent, and model/version drift. The first slice deliberately
limits claims and content, but still needs expert validation.

Open gates E1–E4 and proposed slices E-A–E-D are in [M12 discovery](m12-discovery.md).
No family/rubric/rights approval, official score conversion, audio assessment,
real learner trial or implementation is accomplished by this specification.
