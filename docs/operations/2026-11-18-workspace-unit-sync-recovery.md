# Workspace unit recovery and production candidate

## Status and scope

Prepared on `codex/workspace-sync-hotfix`, independently of the larger code-review remediation and student-annotation branches. Production has **not** been changed. GitHub `main` and the production health endpoint both reported `c6dfa36fb723bb2929fa6cbaffd66815919b064d` during verification on 18 November 2026 (Hong Kong).

No database, API-contract, lesson-format or Supabase migration is required. Deploy an authenticated Preview and manually verify the scenarios below before requesting production promotion. Recheck the production deployment's immutable rollback URL at promotion time.

## Recovery evidence

Read-only investigation was scoped to the account owning the reported lessons, in project `fjrukfawhmbdmrztznlf`:

- Read all four retained cloud workspace snapshots; none contains `11.05`.
- Located and read six saved Histograms lessons: original and taught copies of Histograms 1, 2 and 3.
- All six preserve the association `11.05 Histograms`. They preserve **two different unit IDs**, showing that the unit was recreated.
- Each saved version contains one `Unit resources` slide with empty bullets and empty video, support-sheet, email, practice and going-deeper link fields. No populated links were found in these six saved copies.
- The older admin checkpoints and legacy workspace metadata predate the unit feature; they were not imported or modified.
- Extracted both unit definitions, stable resource IDs, source lesson names and saved versions to the private, Git-ignored file `backups/unit-recovery-2026-11-18/11.05-recovered.json`. No signed URLs or credentials are retained in that file.

This is a recovery **extraction**, not a live restore. No workspace, saved lesson or retrieval data was overwritten. Do not replace a whole workspace with an older snapshot, and do not blindly import two same-name units. Compare against the current library and choose the appropriate stable ID before any selective restoration. Older deleted Storage snapshots and unrelated saved lessons were not claimed to have been inspected.

## Root causes addressed

1. A shared retrieval/bootstrap read used its fresh read timestamp to advance the workspace timestamp. Startup could then prefer an old cloud workspace over newer browser-only units.
2. First autosave adopted the latest HEAD revision instead of the revision whose document was loaded. A stale tab could authorize overwriting another tab's units. Explicit saves omitted the revision check entirely.
3. Slow or cancelled startup could overwrite an in-progress local edit or install an obsolete load's revision. Failed startup lacked an actionable retry.
4. Loading an unchanged workspace triggered an unnecessary upload, churning the four retained snapshots.

## Candidate behaviour

- Shared retrieval/class/template refreshes no longer advance the workspace edit timestamp.
- Workspace writes are checked against the successfully loaded revision, including explicit saves. Own serialized writes advance that revision only after confirmation.
- Overlapping/cancelled loads cannot install a superseded revision.
- Browser recovery continues while the initial cloud comparison is pending. Cloud autosave waits; explicit Save and new-lesson creation cannot start before reconciliation.
- Startup preserves local edits and reconciles the add/edit-only unit libraries by stable ID, retaining the most recently updated resource version. Both local-only and cloud-only units survive whichever lesson workspace is chosen. The chosen workspace's library ordering is retained.
- Failed startup exposes Retry and retains the current in-memory edits during retry.
- An unchanged accepted cloud workspace is not re-uploaded merely because it was opened.

The unit merge does not deduplicate different IDs by name or rewrite historical lesson associations. Existing equal-timestamp conflict policy and server Storage arbitration are unchanged.

## Verification

- Regression tests were observed failing against the original unsafe paths before the fixes: fresh bootstrap timestamps, stale first writes, unguarded manual writes, no loaded revision, startup upload, cancelled overlapping loads, loss of cloud-only units during local editing, unreachable Retry, and premature explicit Save.
- Full unit/contract suite: **89 files, 489 tests passed** (`vitest run --configLoader runner --maxWorkers=2 --testTimeout=15000`). An initial unrestricted run overloaded the machine, timing out one Shell test and cascading into two others; isolated Shell and subsequent bounded full runs passed.
- Lint, TypeScript and `git diff --check`: passed. Presenter runtime browser checks passed.
- Normal optimized Turbopack production build: passed, with the project's actual public environment-variable names populated using local-only placeholders. No service key or production data was used. An alternate Webpack diagnostic exposed an existing route-helper export validation issue; it is not part of this fix or the normal production build.
- Focused browser suite: **6 passed** — four new workspace-sync regressions plus existing light/dark unit authoring, named save, reopen and new-lesson unit flows.
- Full browser run before the final fixture adjustment: **87 passed, 14 failed**. Two failures were a test assuming that reload always dirtied the lesson; the fixture now makes a real unsaved edit before expecting an Open confirmation. Both then passed in the focused run.
- The remaining **12 browser failures were reproduced on an unchanged `c6dfa36` source archive**: eight classic-UI screenshot baselines, two legacy presenter launch/layout fixtures, one expired-image presenter fixture, and Firefox image decoding in the paste fixture. The baseline comparison ran 13 tests: the same 12 failed, Chromium paste passed. No screenshot goldens were refreshed and no unrelated runtime behaviour was changed to hide these failures. The full browser suite is therefore not claimed to be green.

## Preview and production gate

Before promotion, manually check with the teacher account:

1. Create or edit a unit, wait for cloud save, reload, and reopen a saved lesson that uses it.
2. Create a unit in tab A, then edit the old workspace in tab B. B must report a cloud conflict rather than remove A's unit.
3. Delay/disconnect startup, edit locally, reconnect through Retry, and verify the unit library and lesson edit both survive.
4. Open an unchanged lesson and verify there is no automatic save churn.
5. Compare the extracted `11.05 Histograms` versions with the current library before selectively restoring either ID. Their saved resource fields are blank, so do not claim that populated URLs were recovered.

Keep production and historical lessons unchanged until the release and any selective data restoration are explicitly approved. Do not include the broader remediation branch or the separate student-annotation hotfix by accident.
