---
name: fluentcoach-milestone
description: Implement one requested FluentCoach PLAN.md milestone through its gates and prepare, but never merge, its focused pull request.
---

# FluentCoach milestone

1. Use targeted search to locate only the requested milestone and its gates in
   `PLAN.md`; do not read the whole file by default.
2. Follow its references and search `SPEC.md` and `docs/adr/` for only the
   requirements and decisions that affect the milestone.
3. Inspect the relevant implementation, tests, and repository history before
   deciding what must change.
4. Implement only the requested milestone. Never begin the next milestone.
5. Run targeted tests while developing. Fix failures; never weaken, skip, or
   bypass tests to obtain a pass.
6. Run every milestone gate listed in `PLAN.md` before declaring completion.
   Repeat diagnosis, fixes, and validation until all required gates pass.
7. Update documentation and milestone status only after the gates pass. Do not
   duplicate `PLAN.md`, `SPEC.md`, or ADR content in reports or new guidance.
8. Commit the focused changes and prepare a concise PR with the tested commands,
   results, and any genuine limitations.
9. Stop after preparing the PR. Never merge it.

Keep progress updates and the final report concise. Prefer targeted `rg` searches
and line-range reads over loading large documents or writing architecture recaps.
