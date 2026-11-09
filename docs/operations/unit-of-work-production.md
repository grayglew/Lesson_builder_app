# Unit-of-work production release — 9 November 2026

## Live release

- URL: https://lesson-builder-online.vercel.app/builder
- Exact application source: `c27da25c9afb7236e612382f715940da1e213ffb`.
- Immutable production deployment: `dpl_BGcvNySJTaYsEkjRZ5sJoWXHY16w`.
- Immutable URL: https://lesson-builder-online-qv6cgwgqe-grayglew-8338s-projects.vercel.app
- Target/status: production, READY. Next.js production build: 47 seconds.
- GitHub main fast-forwarded to the approved feature branch and pushed before staging.
- Built from a clean Git archive, excluding the unrelated local presenter-runtime line-ending edits. Their file contents were preserved across merge.

## Included features

- Private unit library and reusable resource-slide snapshots associated with lessons.
- Support, Practice and Going deeper categories; valid URLs become labelled clickable buttons, while other text stays non-clickable.
- Up to six Practice entries, arranged in two columns of three.
- Safe resource links in student views, handouts and both bundle PDF variants.
- Optional existing-unit selection or new named-unit creation from the New lesson dialog. New units start with a blank resource slide for later editing.
- Unit changes require explicit Update unit slides for existing lesson snapshots; saved/taught snapshots remain independent.

No database, API-contract or lesson-schema-version migration was needed. Existing lesson naming, overall LO, saving and recovery behaviour is preserved. Refresh an already-open builder tab to load the new UI.

## Verification

- Fresh lint and TypeScript passed.
- Full unit/contract suite: 455/455 tests across 83 files.
- Presenter-runtime browser checks passed.
- Six focused browser checks passed: phone/tablet/desktop student resources, both PDF variants, glue-margin handout geometry, and light/dark authoring/new-lesson/save/reload flows.
- Production candidate built with `--prod --skip-domain`. Its health reported the exact source and production environment while the canonical domain still served the old release.
- All three staged health/auth smoke tests passed before promotion; all three canonical production smoke tests passed afterwards.
- Canonical production health reports the exact source above; deployment inspection resolves the live domain to the immutable deployment above.
- Initial 10-minute production error scan: zero records. The requested one-hour log window was unavailable under current retention; the supported 10-minute query succeeded.
- Monitoring for this release used health/auth checks and runtime logs; no drain or alert configuration was changed or newly provisioned.

## Backup and rollback

- Previous live source: `6dae092b442a97f45edd9b9e51eb272847bbe844`.
- Previous production deployment: `dpl_CevxDNqNeQGEoh6K6syTtk4yYFsx`.
- Previous immutable URL: https://lesson-builder-online-n871mj5fw-grayglew-8338s-projects.vercel.app
- GitHub rollback tag: `rollback/production-before-unit-of-work-20261109`.
- Local source archives and release log: `C:/Users/grayg/Documents/New project 6/backups/releases/2026-11-09-unit-of-work/`.
- Previous-source archive SHA256: `DC4C539A1284477294059AA0154B276C7684E605E19AD27C19F9DEE2F6E25371`.
- Released-source archive SHA256: `A3771B3FA97400FB76AEB0A67D18CFBDA1A6CC4A4011C40F8C072922CE4E5B37`.

If rollback is required, verify project/team, promote the previous immutable production deployment, and repeat canonical health/auth checks. No database rollback is required. Keep the feature branch/worktree for follow-up work; do not delete unrelated local changes.

This release record is documentation only; application code remains identical to the deployed source commit.
