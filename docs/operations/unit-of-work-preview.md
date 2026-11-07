# Unit-of-work resources — Preview review, 7 November 2026

## Deployment

- Preview: https://lesson-builder-online-jj4z2kqjt-grayglew-8338s-projects.vercel.app/builder
- Target: preview; status READY.
- Source: `e03a4e0705a8f76a3eb97443582ce958272ad399`.
- Deployment: `dpl_75aMNwmu9tojtBLAUyVsCHzQyooq`.
- GitHub branch: `feature/unit-of-work-resources`.
- Staging guard: passed for `sbtzyrakbbymahfmdfth`, rejecting production
  `fjrukfawhmbdmrztznlf`.
- Optimized Next.js build passed on Vercel (build output completed in 35s).
- Production remains at `6dae092b442a97f45edd9b9e51eb272847bbe844`.
  No production promotion, main merge, schema/RLS change or data migration.

## Manual acceptance

1. Sign in to Preview. Its lessons and unit library use staging, not production.
2. Open **Library → Units of work**. Create **Probability** with two resource
   slides. Enter links as `[Extra practice](https://example.org/practice)`.
   Replace example.org with real resources you can access. Press **Save unit**.
3. Choose that unit in **Lesson setup → Unit of work**. Confirm both resource
   slides append to the deck. Move them, mark one for the handout, and save the
   lesson. Reload and reopen from Saved lessons: the association and slides
   should remain. A second lesson can select the same unit.
4. Edit the shared unit and save. Existing lesson snapshots must not silently
   change. Press **Update unit slides**, cancel once, then confirm. Ordinary
   slides stay unchanged; matching resource IDs/handout choices survive.
5. Type an unsaved unit edit, visit Starter, then return: the draft remains.
   Changing to another unit or New unit asks before discarding a dirty draft.
6. Present the lesson, publish/upload its student view, and open the student
   code/link separately. Unit links should open in new tabs. The pen and other
   teacher tools remain absent; permitted local answer reveals still work.
7. Download the lesson bundle. Test the links in both the saved-state and answer
   PDFs. A private Google document still requires its own sharing permissions.
8. Save to Builder from the presenter, then open the taught copy. It should
   retain its unit association and saved resource version. Editing the shared
   unit later must not change this taught copy without explicit refresh.
9. Duplicate a unit slide, then clear the unit association after confirmation.
   Linked copies disappear; the detached duplicate and ordinary slides remain.

## Automated evidence

- Baseline: 396/396 tests.
- Final unit/contract suite: 418/418, 80 files.
- Lint and TypeScript: passed.
- Presenter runtime browser checks: passed.
- Final focused browser runs: 16 Compact Console/handout/unit UI checks and 16
  student/PDF/presenter-save checks, all passed.
- Unit UI checked at 375, 768 and 1440px, light and dark; no overflow and 44px
  primary targets. Browser fixtures exercise the real app and serialized
  workspace/named-save payloads; remote teacher-account persistence still needs
  the manual acceptance above.
- Actual PDF URI annotations verified after Chromium rendering and pdf-lib
  merging for both bundle variants.
- Preview health reports the exact source above and environment=preview.
- Three deployed health/authentication smoke tests passed; initial ten-minute
  error scan returned no records.

## Review and implementation decisions

A fresh design check found no unresolved important questions. Final code review
found no Critical issues and three Important issues, all reproduced RED before
fixing: HTML/taught-save association omissions, draft loss on tool navigation,
and SVG animation mutating sanitized links after load. The focused regression
tests and full suite passed after the fix pass.

The user requested design, plan and implementation together, so Preview uses
the stated conservative choices: private catalogue, one optional unit per
lesson, ordinary template snapshots and explicit refresh. These remain open
for acceptance before production; changing the choices requires Preview
revision, not production repair.

Native workspace creation did not return, so the existing isolated checkout
was reused on a new branch. Windows-native bookkeeping replaced Bash-only
skill helpers. Both choices affect workflow only; main and unrelated generated
runtime edits were preserved.

Existing full teacher recovery JSON/HTML exports retain their private library,
matching existing retrieval/template export behavior. Named and taught lesson
files exclude the catalogue; student snapshots/PDFs contain only rendered
lesson resources. If that teacher-recovery behavior is unwanted, change it
before production approval.

Deferred minor: there is no editor-local rendered Markdown preview. Resource
formatting is visible in the existing deck preview after association. Detailed
unit slide layouts and cross-teacher sharing remain outside this first version.

## Rollout

Production approval is still required. Keep this feature branch/worktree for
feedback. No irreversible operation or production data change is needed to
revise or discard this Preview.
