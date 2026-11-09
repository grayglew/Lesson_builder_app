# New-lesson unit selection — Preview, 9 November 2026

- URL: https://lesson-builder-online-quyim9zks-grayglew-8338s-projects.vercel.app/builder
- Exact source: `ef446e4effc20fd312e1aa6c2c859063aeaddad3`.
- Deployment: `dpl_Gu4KU3pyLPs8nZJS17pTJS2e4NES`, READY, Preview.
- Branch: `feature/unit-of-work-resources`.
- Main remains `d1dcada337c86c8b1bc4926f0e5e462a68aa3b43`.
- Production health still reports `6dae092b442a97f45edd9b9e51eb272847bbe844`; no production change.

## Try it

1. Click **New lesson** and fill the normal title, class and teaching date.
2. **Unit of work (optional)** defaults to **No unit**. Choose an existing
   unit to include its resource slides when the lesson is created.
3. Alternatively, choose **Create new unit…** and enter a unique unit name.
   The unit and lesson are created together on successful lesson save. The
   new unit has a blank resource slide; fill its links in Library → Units of
   work, then use Update unit slides in the associated lesson.
4. Save/reload/reopen to check the association persists. Lesson name and
   overall LO are still derived as before and remain editable.
5. Cancel a draft to keep the current lesson/library unchanged. Duplicate
   names are blocked rather than creating another unit.

## Verification

- Seven missing-control/creation tests were verified failing before coding.
- Focused dialog/integration suite then passed 26 tests.
- Final full unit/contract suite: 455 tests, 83 files, all passed.
- Lint, TypeScript, presenter-runtime checks and optimized Vercel build passed.
- Light/dark real-UI flows passed: unit-library setup, six Practice entries,
  named save/open, new lessons with existing and new units, and reload.
- Checked 375/768/1440px, short phone viewport, 44px controls, containment and
  no horizontal overflow. Screenshots inspected. Review also checked a
  200-character existing unit name; no blocking or minor findings.
- The first browser run used a mismatched exact-label locator for the Class
  select. Changing that test to its accessible combobox role/name resolved
  both timeouts; the full flows passed on rerun without a product-code change.
- Preview health reports the exact source and environment=preview. Three
  deployed health/auth smoke tests passed; initial error scan returned zero.
- Staging isolation guard passed. No API, database or schema migration.

The existing saved-lesson and workspace-recovery writes remain separate.
Their normal recovery-warning path is preserved; this does not introduce a
cross-storage transaction. Production release requires explicit approval.
