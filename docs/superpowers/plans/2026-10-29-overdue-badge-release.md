# Overdue badge and retrieval warnings release

> Use native execution with test-driven implementation and one final independent review.

The user approved production release of the retrieval-image warnings and requested a small orange `N overdue` badge beside the top-bar lesson title, visible on every planning tab. Its count must follow the Retrieval tab's selected-class and teaching-date rule, including items due on that date. Derive it from existing store state with `getDueRetrievalItems`; do not add persisted fields, timers, requests or database changes. Keep zero visible as `0 overdue`. Existing typography, dark/light tokens, title ellipsis and mobile controls remain intact.

## Implementation

1. Add failing BuilderShell tests for class/date changes, progress updates, zero items and tool navigation, using fixed teaching dates independent of today. Expected: the new badge is absent before implementation.
2. Pass a derived `overdueCount: number` from BuilderShell to CompactAppBar. Render a noninteractive, politely announced output next to the title. Use existing amber tokens and shrink the title before the badge; neither control may overflow at 375px.
3. Add/extend local Playwright fixtures for the badge and existing image warnings at 375/768/1280/1440 in light/dark themes; verify the count matches the Retrieval panel and follows actual logging/date/class interactions.
4. Run focused tests, lint, TypeScript, all unit tests (two workers to avoid observed host contention), presenter checks and responsive Playwright. Obtain independent review before commit.
5. Record production immutable deployment/commit and create a verified Git source bundle. Merge only this feature into main, preserving unrelated runtime changes. Push GitHub main. Deploy the exact main commit as a production candidate with --skip-domain, verify health/authentication, then promote and explicitly assign lesson-builder-online.vercel.app. Repeat smoke/error checks and record the release.

Production is explicitly authorized by the user; no additional Preview review gate is required. Roll back the immutable deployment and canonical alias together if checks fail. No application data mutation/migration is involved.
