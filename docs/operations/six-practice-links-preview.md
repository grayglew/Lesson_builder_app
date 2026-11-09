# Six Practice links — Preview, 9 November 2026

- URL: https://lesson-builder-online-azfio11uq-grayglew-8338s-projects.vercel.app/builder
- Source: `2aa39c13c3e53ff0c5ef508c1d5f7c9361df200e`.
- Deployment: `dpl_BnLCoDT5dB7oQZLgrVfwPWAB1NJa`, READY, Preview.
- Branch: `feature/unit-of-work-resources`; main and production unchanged.
- Production rollback/baseline remains `6dae092b442a97f45edd9b9e51eb272847bbe844`.

## Manual check

1. Library → Units of work → select or create a unit.
2. Under Practice, retain the first link and use **Add practice link** to add
   up to five more. The count stops at 6 / 6; additional entries can be removed.
3. Try a plain note in one entry: it should appear as inert text, not a link.
4. Save unit, then **Update unit slides** for an already associated lesson.
5. Check two columns of three entries in the presenter; open the newly
   published student view and exported PDFs to check their destinations.
6. Save/reload/reopen to confirm all entries persist.

## Verification

- RED/GREEN: new tests initially failed on discarded extras, missing controls
  and single-entry rendering; they now pass.
- 442 unit/contract tests, lint, TypeScript and presenter-runtime checks passed.
- Six focused browser tests passed: editor light/dark save/reopen, student
  375/768/1440px geometry, both PDF variants retaining all nine fixture links,
  and half-page handouts with optional glue margins.
- Independent review: no Critical or Important findings. Re-add after removing
  a middle entry was added to the component regression test and passed.
- Optimized Vercel build passed; health returns the exact source SHA and
  environment=preview. All three deployed health/auth smoke tests passed.
- Initial Preview runtime error scan returned zero records.
- Staging environment guard passed; no migration or production data change.

Legacy `practice` values remain unchanged. `additionalPractice` is optional
and holds at most five entries. No dependency or schema-version change.
Production release requires separate approval.
