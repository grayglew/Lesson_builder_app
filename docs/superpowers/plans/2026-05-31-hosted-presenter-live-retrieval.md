# Hosted Presenter Live Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a connected lesson delivery path that keeps the current exported HTML presenter behavior while allowing starter-slide buttons to update the retrieval tracker live.

**Architecture:** Keep the current builder and offline HTML export unchanged. Add a hosted-presenter launch path from Saved Lessons that generates the current presenter HTML in-browser with a live-mode configuration, then posts retrieval log events to an authenticated Next.js API route. The API updates the per-user global builder sync document in Supabase Storage.

**Tech Stack:** Next.js App Router API routes, Supabase Storage via `@supabase/ssr`, existing `public/builder/app.js` presenter/export runtime, static Node regression scripts.

---

### Task 1: Regression Contract

**Files:**
- Create: `scripts/test-hosted-presenter-live-retrieval-regression.mjs`

- [ ] Write a failing static regression test proving the app exposes a Present action, keeps Download as offline export, and has an authenticated live retrieval API.
- [ ] Run `node scripts/test-hosted-presenter-live-retrieval-regression.mjs` and confirm it fails because the feature does not exist yet.

### Task 2: Live Retrieval API

**Files:**
- Create: `src/app/api/presenter/retrieval-log/route.ts`
- Create: `src/lib/builder-sync/live-retrieval.ts`

- [ ] Add validation for `lessonId`, `lo`, `className`, `teachingDate`, and positive `deltaSeen`.
- [ ] Verify the saved lesson belongs to the signed-in user.
- [ ] Load the latest `global` builder sync document from Storage.
- [ ] Find or create the matching retrieval item for the supplied class and LO.
- [ ] Increment `seenCount`, set `lastTaught`, update `updatedAt`, write a new global snapshot, and retain the existing snapshot cleanup behavior.

### Task 3: Hosted Presenter Launch

**Files:**
- Modify: `public/builder/app.js`

- [ ] Add a `Present` action to each saved lesson row.
- [ ] Implement `presentSavedLesson(id)` by loading the saved lesson JSON, building the existing presenter HTML with live retrieval options, and opening it in a same-origin presenter window.
- [ ] Extend `buildStandaloneHtml` to accept optional live mode configuration while preserving current offline export calls.
- [ ] Add starter-slide live buttons only when live mode is enabled.
- [ ] Add presenter-side script to post starter LO events to `/api/presenter/retrieval-log`.

### Task 4: Verification

**Files:**
- Modify as needed: `scripts/test-hosted-presenter-live-retrieval-regression.mjs`

- [ ] Run the focused regression script.
- [ ] Run existing presenter pointer regression.
- [ ] Run saved lesson regression.
- [ ] Run builder sync split regression.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.

### Rollback

If the implementation causes problems, restore the snapshot created before coding:

`C:\Users\grayg\Documents\New project 6\rollback-snapshots\lesson-builder-online-20260531-081638`

Copy its contents back into:

`C:\Users\grayg\Documents\New project 6\lesson-builder-online`
