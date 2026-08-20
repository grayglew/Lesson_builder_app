# Compact Console: Main_build implementation handoff

## Purpose

This document hands the approved **Compact Console** visual direction to the `Main_build` task for implementation in the real Lesson Builder.

The design is approved as a direction, but it is **not approval to change, remove, simplify, or reinterpret existing functionality**. The current production builder remains the behavioral source of truth. The design mockup is only a visual and interaction reference.

## Safety and ownership

- Start implementation only from the latest clean `Main_build` state after its current production work is committed.
- Do not base production work on the design branch; it may be behind `Main_build` functionally.
- Do not replace the production builder with `CompactConsoleReview`.
- Do not copy fixture handlers or toast-only mock actions into the real builder.
- Do not change Supabase schemas, API contracts, lesson schemas, presenter output, persistence, or export formats as part of this UI project.
- Do not deploy the new shell to the production alias before explicit visual and functional acceptance.
- Keep the existing production UI available for rollback until the compact shell has passed the complete acceptance matrix.

## Reference material

### Interactive specification

- Focused Preview: <https://lesson-builder-online-5y2jam89h-grayglew-8338s-projects.vercel.app/design-review/builder/compact>
- Full design lab: <https://lesson-builder-online-5y2jam89h-grayglew-8338s-projects.vercel.app/design-review/builder>
- Design branch: `design/lesson-builder-ui`
- Focused mockup commit: `2982c27`
- Draft design PR: <https://github.com/grayglew/Lesson_builder_app/pull/4>

### Source references

- Visual structure and interaction examples: `src/features/design-review/CompactConsoleReview.tsx`
- Tokens, layout, dark theme, and responsive behavior: `src/features/design-review/CompactConsoleReview.module.css`
- Component interaction coverage: `tests/features/CompactConsoleReview.test.tsx`
- Responsive/browser acceptance examples: `tests/e2e/builder-design-review.spec.ts`

These files are reference material. The live implementation should reuse the current builder components, state, hooks, handlers, dialogs, and API clients.

## Chosen design direction

The Compact Console should feel like a focused professional authoring tool rather than a dashboard.

Key characteristics:

- A persistent application bar for identity, lesson context, save state, and global actions.
- A compact left lesson rail for metadata and grouped authoring tools.
- One central authoring workspace with a clear title and contextual primary actions.
- A compact right deck rail for slide selection, ordering, presentation, handouts, and transfers.
- Dense but readable typography using IBM Plex Sans with IBM Plex Mono for codes, counts, and small labels.
- Strong hierarchy from lines, spacing, surface contrast, and restrained teal accents rather than large cards or decorative gradients.
- Light and dark themes based on shared semantic tokens.
- On mobile, a three-item bottom dock with Lesson and Deck opening as drawers while Build remains the main surface.

Approximate desktop shell dimensions from the approved mockup:

- App bar: `3.5rem` high.
- Lesson rail: `15rem` to `15.5rem`, collapsible to `3.8rem`.
- Deck rail: `18rem` to `19rem`, collapsible to `3.8rem`.
- Central workspace: flexible, with a practical minimum around `34rem` at wide desktop sizes.
- Mobile drawer width: lesson `min(88%, 20rem)`; deck `min(92%, 22rem)`.
- Interactive touch targets: at least `2.75rem` / 44px.

## Sources of truth

Use this priority order whenever the mockup and current app differ:

1. Current production behavior and data integrity.
2. Current automated functional tests and API contracts.
3. Current accessible dialog, toast, autosave, and error-handling behavior.
4. The approved Compact Console layout and visual language.
5. Mockup wording and fixture actions.

For example, the mockup includes a `Blank` deck action. If the live builder does not currently have that exact action, map it to an already supported blank/placeholder workflow or omit it pending product approval. Do not invent functionality merely because a mock control exists.

## Non-negotiable functional preservation matrix

Before changing the shell, capture the current behavior of every row below in tests. After each implementation slice, the same behavior must still pass.

| Area | Existing behavior that must remain |
| --- | --- |
| Authentication | Login protection, logout, active-user enforcement, admin access, and impersonation identity/control. |
| Lesson metadata | Title, class, and teaching date remain bound to the canonical builder document. |
| Class management | Add, rename, and delete/archive class workflows, including confirmations, RLS, progress archival, and saved-lesson preservation. |
| Lesson persistence | Save, Save as, New lesson, cloud autosave, dirty state, conflict handling, saved timestamps, recovery behavior, and failure notifications. |
| Starter | Four slots, manual objectives, due-item suggestions, hover paste, drag/drop/upload, drawing, image-pair selection, locked images, and exact slide insertion. |
| Saved lessons | Sorting, open, present, HTML download, PowerPoint bundle, confidence, class change, rename, delete, taught-state styling, and legacy lesson compatibility. |
| Retrieval | Filtering, multi-selection, editing, images, slide/revision generation, logging, rollback, archiving, deletion, scheduling, and current image resolution. |
| Example | Question and answer images, slide creation, retrieval-bank create/update, LO matching, and preservation of untouched images. |
| Worksheet | Attachment selection, persistence, rendering, and export/presenter behavior. |
| PDF | Multi-page rendering, page aspect ratios, full-width presenter display, vertical scrolling, rotation/handout behavior, and memory-safe PDF export. |
| CFU | Current authoring fields, image/drawing behavior, validation, slide schema, preview, and presenter output. |
| Draw | Pen/highlighter/eraser behavior, undo, clear confirmation, resolution, save, and reopening. |
| Templates | Template list, insert, create/update/delete behavior, confirmations, and persistence. |
| Placeholder | Text validation and placeholder-slide insertion. |
| LaTeX | Question/answer editing, safe rendering, validation, preview, and presenter behavior. |
| Deck | Slide preview, active slide, independent handout multi-selection, reorder up/down, delete, reset, collapse, and stable slide IDs. |
| Lesson transfers | All currently supported import/export actions, validation, progress/error feedback, legacy compatibility, and preservation of shared builder data on lesson-only imports. |
| Handouts | Existing selection rules, A4 layouts, worksheet/PDF rotation, page ordering, and print behavior. |
| Presenter | Launch preparation, starter hydration, live retrieval controls, scrolling, PDF sizing, toolbar, drawing, reveal, poll, Save to Builder, and generated standalone HTML behavior. |
| Notifications | Current in-app dialog/toast semantics, focus trapping, safe destructive focus, queueing, validation, dismissal, and async status behavior. |
| Accessibility | Keyboard access, visible focus, labels, roles, live regions, focus restoration, reduced motion, and minimum mobile targets. |

Student sharing has previously been recorded as incomplete/deprioritized. Do not accidentally present it as completed as part of this visual change. Preserve its current state and track it separately.

## Approved region-by-region mapping

The mockup's review map uses regions 01–06. Use the same numbers in implementation reviews.

### 01 — Application bar

Approved appearance:

- Compact product identity at the left.
- Current lesson title, class/date context, and cloud state visible without taking over the workspace.
- Global Lessons, Present, and Save actions at desktop widths.
- User identity at the far right.

Required real wiring:

- `Save` calls the existing save path and keeps current busy/error/success behavior.
- `Present` calls the existing live presenter preparation path, including legacy asset embedding and starter hydration.
- `Lessons` opens real saved-lesson access and must not discard dirty workspace state silently.
- The cloud label reflects real autosave state; it must not be a hard-coded “Saved.”
- Preserve actor/effective-user information and the current impersonation control.
- Preserve access to Admin, logout, and existing external tools. These can move into an account/utility menu, but may not disappear.

### 02 — Lesson rail

Approved appearance:

- Expandable Lesson details section.
- Tool navigation grouped under compact headings.
- Import/export access at the bottom where space permits.
- Desktop collapse control.

Recommended tool grouping without losing tools:

- **Library:** Saved lessons, Templates.
- **Core slides:** Starter, Retrieval, Example, CFU.
- **Resources:** Worksheet, PDF.
- **Create:** Draw, Placeholder, LaTeX.

Required real wiring:

- Keep title, class, date, class CRUD, Save, Save as, New lesson, and autosave state reachable.
- The approved mock only displays part of this surface; production functionality takes precedence.
- Collapsing a group or rail must never reset an open composer, unsaved local inputs, image slots, or the builder document.
- Tool buttons must keep the current `activeTool` behavior and accessible current-page state.
- Persisting rail/group preferences is optional. If implemented, use UI-only storage and never place it in the lesson document.

### 03 — Workspace header

Approved appearance:

- Breadcrumb-like context such as `Build / Starter`.
- Clear tool title.
- Contextual Present and Save actions where useful.

Required real wiring:

- Do not duplicate save/present logic. Both header and app-bar controls must call the same handlers.
- The workspace title must use the canonical `toolLabels` mapping.
- Tool-specific validation and busy states remain inside their existing feature components.

### 04 — Authoring workspace

Approved appearance:

- Compact, line-based panels with restrained card styling.
- Image question/answer pairs remain visually dominant.
- Tool actions are progressively disclosed through menus where this does not make frequent actions harder.

Required real wiring:

- Restyle existing composers rather than rebuilding their domain logic.
- Preserve hover-paste targeting, upload, drop, drawing, retrieval images, validations, and focus behavior.
- Do not globally clip popovers with `overflow: hidden`; drawing, image, template, and action menus must escape their local cards correctly.
- Maintain each composer's local draft state across rail/drawer opening and closing.
- Retain clear text labels or accessible names for icon-only controls.

### 05 — Deck rail

Approved appearance:

- Compact thumbnails with an explicit active slide.
- Handout selection independent from the active editing cursor.
- Frequent actions visible; lower-frequency transfer actions in the More menu.
- Desktop collapse control.

Required real wiring:

- Keep `selectedSlideId` and `selectedPreviewSlideIds` as separate concepts.
- Preserve stable slide IDs during reorder, selection, export, and deletion.
- Preserve the existing handout selection count and strict selection validation.
- Wire Present, handout, import, PDF/HTML/JSON exports, and any other supported transfers to the existing `useLessonExportActions` surface.
- Retain reset confirmation and current delete behavior.
- Reordering should keep existing accessible up/down actions unless a tested pointer/keyboard drag implementation is added in addition.

### 06 — Mobile dock and drawers

Approved behavior:

- Bottom dock: Lesson / Build / Deck.
- Build is the main route and remains visible by default.
- Lesson and Deck open as overlay drawers.
- A scrim closes the active drawer.

Required implementation details:

- Use the same mounted lesson rail, workspace, and deck rail—not duplicate mobile versions with separate state.
- Opening or closing a drawer must not unmount the active composer or discard unsaved component state.
- Lock background scroll while a drawer is open.
- Move focus into the drawer, trap it while open, support Escape, and restore focus to the invoking dock button.
- Respect `env(safe-area-inset-bottom)`.
- Test at 320px, 375px, 390px, 768px, and desktop widths.
- No horizontal document overflow is acceptable.

## Dark theme requirements

The mockup already defines approved light and dark semantic tokens. Migrate the tokens, not the fixture selectors.

Suggested token set:

- `--builder-page`
- `--builder-surface`
- `--builder-surface-strong`
- `--builder-surface-muted`
- `--builder-ink`
- `--builder-muted`
- `--builder-line`
- `--builder-line-strong`
- `--builder-accent`
- `--builder-accent-soft`
- `--builder-accent-ink`
- `--builder-danger`
- `--builder-shadow`

Rules:

- Apply theme tokens to application chrome and form controls.
- Do not recolor user lesson content, uploaded images, PDF pages, canvas drawings, slide previews, presenter output, handouts, or exports merely because the builder is dark.
- Maintain WCAG AA contrast for ordinary text and controls.
- Use `color-scheme` so native inputs match the selected theme.
- Honor `prefers-reduced-motion`.
- Store the user's explicit theme preference outside the builder document. Use system preference only when the user has not chosen one.
- Avoid a server/client theme flash. Resolve the initial theme before or during first paint using the project's established Next.js pattern.

## Recommended production architecture

Do not implement the new UI by growing `BuilderShell` with another large conditional tree. Extract presentation components while leaving orchestration and domain state in the existing shell.

Suggested component boundary:

```text
BuilderShell
├── BuilderAppBar
├── BuilderLessonRail
│   ├── LessonDetailsSection
│   ├── BuilderToolGroups
│   └── BuilderUtilityMenu
├── BuilderWorkspace
│   ├── BuilderWorkspaceHeader
│   └── existing active composer
├── BuilderDeckRail
│   ├── DeckActionsMenu
│   └── existing SlidePreview list
├── BuilderMobileDock
├── existing NewLessonDialog / app dialogs
└── existing BuilderStatusToast
```

State ownership:

| State | Owner |
| --- | --- |
| Lesson document, slides, global data, active lesson IDs | Existing Zustand builder store. |
| Saves, imports, exports, presenter launch, class/retrieval mutations | Existing hooks, API client, and server routes. |
| Active authoring tool | Existing `BuilderShell` state unless deliberately moved to a small UI store. |
| Rail collapse, group expansion, open menu, mobile drawer | Local chrome state or a dedicated UI-only hook. |
| Theme preference | UI preference storage, never the lesson schema. |
| Dialogs/toasts/autosave status | Existing notification provider and builder status store. |

Handlers should be passed into the new chrome components. Do not recreate API calls in navigation or menu components.

## Safe implementation and preview plan

### Phase 0 — Baseline after Main_build is stable

1. Finish and commit the current `Main_build` work.
2. Create a new implementation branch from that exact latest state.
3. Run and record the current full unit, browser, presenter-runtime, lint, typecheck, and build results.
4. Add or strengthen functional tests for any preservation-matrix row that lacks behavioral coverage.
5. Keep PR #4 as a visual reference; do not merge its fixture component as the real builder.

Gate: zero baseline failures and a clean branch before visual implementation begins.

### Phase 1 — Tokens and structural extraction

1. Add semantic builder tokens for light mode without materially changing appearance.
2. Extract app bar, lesson rail, workspace header, and deck rail presentation boundaries from `BuilderShell`.
3. Pass existing state and handlers through unchanged.
4. Confirm all current tests still pass before applying the new layout.

Gate: a refactor-only commit with no intentional behavior or visual change.

### Phase 2 — Desktop Compact Console shell

1. Apply the approved three-column grid and app bar.
2. Implement real grouped tool navigation containing all current tools.
3. Add rail collapse behavior.
4. Move existing actions into approved menus without changing their handlers.
5. Verify every composer and saved-lesson surface in the new central workspace.

Gate: deploy to a Preview-only functional review route and obtain desktop feedback.

### Phase 3 — Dark theme

1. Add semantic dark tokens and persisted preference.
2. Audit every builder component, menu, dialog, toast, input, and disabled state.
3. Explicitly verify slide/PDF/image content remains unmodified.

Gate: user acceptance of light and dark at desktop and tablet sizes.

### Phase 4 — Mobile drawer + dock

1. Add the fixed dock and shared-component drawers.
2. Implement scroll locking, focus management, Escape, scrim, and safe areas.
3. Test every authoring tool for reachable controls and no state loss.
4. Test menus/dialogs/drawing at narrow widths.

Gate: user acceptance on a real mobile browser plus automated responsive checks.

### Phase 5 — Consolidation and rollout candidate

1. Remove temporary review-only branches from the real shell.
2. Refresh visual baselines only after reviewing each diff.
3. Run the complete acceptance suite against the Preview/staging environment.
4. Take a fresh rollback point and follow the production release runbook.
5. Promote only after explicit approval.

Gate: production functionality matrix fully checked, manual acceptance complete, and rollback verified.

## How the user should see implementation work

The static design Preview is useful for visual reference, but functional implementation needs a separate Preview backed by staging.

Recommended approach:

- Add a Preview-only route such as `/builder/compact-review` that renders the **same authenticated builder and same feature components** with the compact appearance enabled.
- Gate it server-side so it returns `notFound()` when `VERCEL_ENV === "production"` until final approval.
- Prefer a `variant="compact-console"` or equivalent presentation prop on the canonical shell over copying the builder into a second implementation.
- Deploy each phase to a unique immutable Preview and maintain a stable design-review alias if the current deployment process supports it.
- Keep the original `/builder` path unchanged during review.
- Use the staging Supabase project for functional Preview testing; do not point design-review builds at production data.

The user should comment using the mockup's region numbers (01–06), viewport, theme, and exact workflow. Example: `05 / mobile / dark — the handout selection count is hard to find after choosing three slides.`

## Automated acceptance requirements

Run the latest repository commands rather than assuming the counts recorded on the design branch are current.

Required gates:

- ESLint.
- TypeScript.
- Complete unit/component suite.
- Presenter runtime browser check.
- Complete builder Playwright suite.
- Optimized Next.js production build.
- Preview deployment smoke tests.

Add focused coverage for:

- Every grouped tool opens the same composer as before.
- Save, Save as, New lesson, autosave, and dirty-workspace confirmations.
- Class add/rename/delete.
- Lesson menu and all saved-lesson actions.
- Deck active slide versus multi-selection.
- Reorder/delete/reset.
- Present, handout, and every import/export action.
- Rail collapse without state loss.
- Menu keyboard navigation, outside click, Escape, and focus restoration.
- Dark/light persistence and first-render theme.
- Mobile drawers, focus trapping, scroll lock, safe areas, and no horizontal overflow.
- 44px minimum targets on touch layouts.
- Dialogs/toasts remain above rails, drawers, menus, and composer overlays.
- Existing hover-paste, drawing, PDF, and presenter scenarios.
- No changes to lesson schemas or API payload contracts.

Suggested viewport matrix:

- `320 × 568` narrow-phone stress test.
- `375 × 812` common phone portrait.
- `390 × 844` modern phone portrait.
- `768 × 1024` tablet portrait.
- `1024 × 768` compact desktop/tablet landscape.
- `1440 × 900` standard desktop.
- `1920 × 1080` wide desktop.

## Manual acceptance checklist

At minimum, manually exercise the following in both light and dark where relevant:

1. Create a lesson, enter title/class/date, save, reload, and reopen it.
2. Switch through all 11 authoring tools and verify no control becomes unreachable.
3. Build one lesson containing every slide type.
4. Paste, upload, drop, and draw into supported image boxes.
5. Generate and log retrieval, then roll it back.
6. Select multiple deck slides, reorder them, create a handout, and verify active-slide state remains independent.
7. Present a new lesson and a legacy saved lesson.
8. Exercise every supported import/export format.
9. Open saved-lesson actions including confidence and PowerPoint bundle.
10. Collapse/expand rails while a composer contains unsaved local inputs.
11. Repeat representative authoring, deck, menu, dialog, and drawing flows on mobile drawers.
12. Confirm keyboard-only navigation and focus restoration.

## High-risk regression areas

- **Component unmounting:** conditional mobile/rail rendering can discard composer-local draft state.
- **Nested scrolling:** app bar, workspace, drawers, PDF pages, and deck must have explicit scroll ownership.
- **Overflow clipping:** menus and image actions can be hidden by rail/card overflow rules.
- **Z-index collisions:** dialogs, drawing overlays, toasts, menus, drawers, and presenter popups need a documented layer scale.
- **Active versus selected slide:** merging these states breaks handout behavior.
- **Dark mode leakage:** builder theme must not alter authored slide/export colors.
- **Duplicate handlers:** multiple visible Save/Present controls must share the same real action path.
- **Mobile duplication:** separate mobile components can drift from desktop behavior or duplicate API calls.
- **Busy states:** moving actions into menus must preserve disabling, progress, error, and retry behavior.
- **Legacy lesson conversion:** presentation and bundle/export preparation must keep compatibility hydration.
- **Autosave races:** cosmetic state changes must not mark the lesson document dirty or trigger unnecessary writes.

## Definition of done

The Compact Console implementation is complete only when:

- The user approves desktop light, desktop dark, and the mobile drawer+dock layout.
- Every preservation-matrix row is verified by tests or a recorded manual check.
- All current authoring tools and saved-lesson actions remain reachable.
- All current presenter, handout, import, export, and persistence workflows behave the same.
- No database, API, lesson-schema, presenter-schema, or export-format change was introduced solely for the redesign.
- Accessibility and responsive requirements pass.
- The functional review route passes against staging.
- Production remains reversible to the prior builder artifact.
- The user explicitly approves production promotion.

## Suggested first Main_build task

Do only Phase 0 and the refactor-only portion of Phase 1 first:

> From the latest Main_build state, inventory and test the existing BuilderShell actions, then extract app-bar, lesson-rail, workspace-header, and deck-rail presentation components without changing CSS, handlers, state ownership, routes, or behavior. Deploy nothing to production. Stop after the complete current suite passes and provide the component boundary diff for review.

This creates a safe foundation for the new appearance while making functionality loss immediately visible.
