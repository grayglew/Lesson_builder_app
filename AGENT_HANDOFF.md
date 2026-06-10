# Lesson Builder Online Agent Handoff

Last updated: 2026-05-27, Asia/Hong_Kong

## User Goal

The user has a local image-based Lesson Builder app and wants the online/Vercel version to faithfully preserve that interface and workflow while adding Supabase-backed sync, saved lesson storage, retrieval-bank persistence, and multi-device access.

The user strongly prefers the online app to behave like the local `index.html` and `app.js` source-of-truth files, not like the earlier text-based React lesson editor.

## Primary Repo And Paths

- Main online repo: `C:\Users\grayg\Documents\New project 6\lesson-builder-online`
- Current faithful builder UI is served from: `public/builder/index.html`
- Main browser app logic is in: `public/builder/app.js`
- Next.js app/router/API code is in: `src/app`
- Supabase server helper: `src/lib/supabase/server.ts`
- Builder sync helpers: `src/lib/builder-sync`
- Vercel project file: `.vercel/project.json`

Earlier user-identified local source-of-truth paths:

- `file:///C:/Users/grayg/Documents/New%20project%206/lesson-builder-vercel/index.html`
- `C:/Users/grayg/Documents/New project 6/lesson-builder-vercel/app.js`

## Deployment

- Production app URL: `https://lesson-builder-online.vercel.app`
- Latest successful cleanup deployment URL: `https://lesson-builder-online-i1xbtesnp-grayglew-8338s-projects.vercel.app`
- Vercel project:
  - Project id: `prj_07kM7wxd6w92VaryIIPh8oAQ1qGz`
  - Org/team id: `team_GSiifl9FfXNbUL68yhoIIeeo`
  - Project name: `lesson-builder-online`

Vercel CLI was not globally installed, but `npx.cmd vercel deploy --prod` worked from the repo root after approval.

## Supabase Project

- Supabase project name: `Lesson builder`
- Project ref/id: `fjrukfawhmbdmrztznlf`
- Region: `ap-southeast-2`
- Postgres version seen during investigation: `17.6.1.121`
- Main Storage bucket: `lesson-assets`

Known users:

- `grayglew@gmail.com`
  - User id: `225f2092-e96f-4065-bf8f-0d68d7c3cf78`
- `sxia@dbis.edu.hk`
  - User id: `ad7a8f0b-5d66-4110-a4cd-74ba5f92299e`

Do not record or expose user passwords in code, logs, or handoff notes.

## Authentication And Access

- Email sign-up was disabled.
- The app is restricted to the allow-listed users above.
- Login page: `/login`
- Logout route exists and returns the user to login.
- The current user email is shown in the builder UI.

Relevant auth files:

- `src/lib/auth/primary-user.ts`
- `src/app/login/page.tsx`
- `src/app/login/actions.ts`
- `src/app/auth/logout/route.ts`
- `src/lib/builder-sync/auth.ts`

## Storage Architecture

The app moved away from storing one huge combined builder-state file.

Current intended split:

- Workspace sync:
  - Current lesson title/class/date/slides/annotations/recovery state.
  - Stored under `{userId}/builder-state/workspace/...json`
- Global sync:
  - Retrieval bank, classes, templates, other global per-user data.
  - Stored under `{userId}/builder-state/global/...json`
- Saved lessons:
  - Metadata rows in Postgres table `builder_lessons`
  - Lesson JSON files in Storage at `{userId}/lessons/{lessonId}/lesson.json`

Retrieval bank should remain global per user and must not be duplicated into every saved lesson.

## Saved Lessons Feature

Implemented feature set:

- Save current lesson.
- Save as copy.
- Open/load saved lesson back into the builder.
- Rename metadata.
- Delete saved lessons.
- Filter by class and date range.
- Download ready-to-present HTML from the Saved Lessons page, not raw JSON.

Relevant routes:

- `src/app/api/builder-lessons/route.ts`
- `src/app/api/builder-lessons/upload-url/route.ts`
- `src/app/api/builder-lessons/complete/route.ts`
- `src/app/api/builder-lessons/open/route.ts`
- `src/app/api/builder-lessons/rename/route.ts`
- `src/app/api/builder-lessons/delete/route.ts`

The user specifically asked that saved lessons be on a separate screen/button, not a small tab inside the left sidebar.

## Retrieval Bank Feature Notes

Important implemented/desired behavior:

- Retrieval bank is unique per user.
- Class selection should be a dropdown, not a free-text box.
- There is an Add class button.
- Retrieval list should sort due items first.
- Edits to spacing/seen/last taught should update the database/global sync.
- Retrieval lesson generator creates slides from selected LOs.
- Each generated retrieval slide should place two copies/questions in the top two quarters.
- A central vertical divider line is preferred over hard borders around each slide quarter.
- LOs and their images should be editable.
- Re-adding an existing LO should warn the user that it will update that LO.

Answer image support was added/asked for:

- Retrieval/question images may have optional answer images.
- In generated starters/retrieval lessons, clicking the question image toggles question/answer.
- Example images may have optional answer images; clicking should reveal the answer below rather than replacing the question image.

## Template Slides

The user requested a screen for standard slide templates.

Default templates requested:

- Start of lesson expectations
- Teacher example expectations
- Independent practice expectations

Templates are text/bullet-point slides. Users should be able to add and edit templates.

## Presenter / Exported HTML Requirements

The exported HTML lesson is very important and should preserve:

- Pen toolbar functionality.
- Tablet pen and finger support.
- Finger should pan where appropriate.
- Tablet pen should default to pen drawing.
- Buttons must work with pen or finger.
- Pen must be able to write over clickable answer-reveal areas without accidentally triggering reveal or stopping after a short burst.
- Answer reveal areas should not steal pointer capture during pen drawing.
- A4 PDF slides should render the same width as other slides.
- Toolbar buttons in exported HTML were increased by 50%.
- Pen colour buttons should select colour immediately.
- A separate colour-picker button should open the colour picker.

There has been a recurring bug where pen writing stops after short bursts, especially on top of clickable answer-reveal areas. Be systematic if this returns; inspect pointer events, capture handling, passive touch listeners, and whether reveal click handlers are firing during pen input.

Useful regression script:

- `scripts/test-presenter-pointer-regression.mjs`

## Recent Supabase Usage Investigation And Cleanup

The user hit a Supabase usage/storage limit. Investigation found:

- Postgres database size was small, about `17 MB`.
- Supabase Storage bucket `lesson-assets` was the issue.
- Before cleanup:
  - Total Storage: `2.622 GB`
  - Legacy builder-state snapshots: about `2.438 GB`
  - These were old huge combined state files.
- Supabase blocks direct deletion from `storage.objects` via `storage.protect_delete()`.
  - Do not delete Storage metadata directly.
  - Use the Supabase Storage API `.remove()` so physical objects are deleted properly.

A safe authenticated cleanup page/API was added and deployed:

- Page: `/admin/cleanup-storage`
- API route: `/api/admin/cleanup-legacy-builder-state`
- Helper: `src/lib/builder-sync/legacy-cleanup.ts`
- Regression script: `scripts/test-legacy-builder-state-cleanup-regression.mjs`

The user clicked the cleanup button while signed in. Verification after cleanup:

- Total Storage: `295.22 MB` / `0.288 GB`
- `52` older legacy snapshots were removed.
- Remaining breakdown:
  - `builder-state/global`: `189.77 MB`
  - `builder-state/legacy`: `48.47 MB`, one kept recovery snapshot per user
  - `other`: `35.32 MB`
  - `saved-lessons`: `21.22 MB`
  - `builder-state/workspace`: `0.44 MB`

Next potential cleanup: reduce retained `global` snapshots from 4 to 1 to free about `142 MB`, but this is not urgent.

An attempted service-role Supabase Edge Function cleanup was rejected by safety review as too risky. Continue using the signed-in Storage API route/page approach unless the user explicitly approves a privileged backend method after being told the risk.

## Backend Import History

The user imported local backup data into Supabase more than once, including:

- `9ma1-set-notation-revision.lesson-builder-backup(1).json`
- `9ma2-hcf-and-lcm.lesson-builder-backup.json`

There were issues with frontend upload service availability, so backend import paths were used after user approval. Current retrieval data should be checked in Supabase rather than assuming local backup state.

## Important UX Expectations

The user repeatedly emphasized:

- Keep the image-based slide generator, not a text-based slide editor.
- Preserve the local app interface closely.
- Do not unexpectedly replace the working builder UI with a new React/editor UI.
- All app changes should be available from any device via Vercel/Supabase.
- Storage limits matter; avoid creating huge duplicate JSON blobs.

## Verification Commands

Use `npm.cmd` in PowerShell because `npm.ps1` can be blocked by execution policy.

Common checks:

```powershell
npm.cmd run lint
npm.cmd run build
node scripts/test-presenter-pointer-regression.mjs
node scripts/test-builder-sync-split-regression.mjs
node scripts/test-builder-load-performance-regression.mjs
node scripts/test-builder-class-dropdown-regression.mjs
node scripts/test-pdf-slide-output-regression.mjs
node scripts/test-saved-lesson-library-regression.mjs
node scripts/test-legacy-builder-state-cleanup-regression.mjs
```

Vercel deploy command used successfully:

```powershell
npx.cmd vercel deploy --prod
```

## Current Known State

- Production deployment is healthy.
- Supabase Storage cleanup succeeded and current Storage usage is well below the free 1 GB Storage limit.
- Git is not available on PATH in this environment, so `git status` failed with “git is not recognized”.
- The cleanup admin page remains deployed and authenticated. It currently has no major legacy cleanup left to do.
- Be careful with any future change that affects exported HTML pointer events, Storage sync payload shape, or the faithful local-style builder UI.

## Good Next Steps For A New Agent

1. If working on frontend behavior, start by reading `public/builder/index.html` and `public/builder/app.js`.
2. If working on sync/storage, read `src/lib/builder-sync/*` and the `/api/builder-sync/*` routes.
3. If investigating Supabase usage, query `storage.objects` grouped by path/category before changing code.
4. If making UI changes, verify the actual builder and exported lesson HTML, not just the Next.js pages.
5. Keep secrets out of notes, code, and logs.
