---
name: fluentcoach-pr-fix
description: Resolve FluentCoach pull-request review feedback and CI failures with minimal fixes, complete validation, and no merge or milestone expansion.
---

# FluentCoach PR fix

1. Inspect the PR's review feedback and outstanding threads.
2. Inspect the first failing CI gate and its relevant log; avoid loading unrelated
   logs or repository documentation.
3. Diagnose the root cause before editing.
4. Make the smallest correct fix that resolves the feedback or failure. Avoid
   unrelated cleanup and never start another milestone.
5. Run the targeted test for the change, then rerun the complete milestone/PR
   gate set.
6. If a gate fails, return to the first failure, diagnose, fix, and repeat until
   every required gate is green. Never weaken, skip, or bypass tests.
7. Update the focused commit and PR with concise results and any genuine
   limitations. Never merge the PR.

Use targeted search and line-range reads. Reference `PLAN.md`, `SPEC.md`, and
ADRs when needed instead of repeating their architecture or requirements.
