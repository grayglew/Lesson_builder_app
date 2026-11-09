# Categorized unit resources

Implement the user's explicit refinement request in Preview, not production.
Each unit resource slide has three fixed categories:

- Support: Video, Scaffolded support sheet, Email your teacher.
- Practice: Extra practice resources.
- Going deeper: Challenging exam questions, Maths challenge questions,
  Investigation task.

Use seven individually labelled optional text fields. Valid absolute HTTP(S)
URLs become anchors styled as buttons with the fixed resource label, never
visible URL text. In the email field, a single email address or mailto link is
also accepted. Other nonempty input is escaped literal text in a non-clickable
tile. Empty fields are omitted; empty categories show a neutral empty state.
All three category headings remain. No Markdown is needed.

Extend UnitResource with optional structured resources, copied to normal
template slide snapshots. Existing catalogue entries and saved snapshots
remain readable. Earlier free-text bullets are retained for reference in the
editor with explicit notice that categorized slides use the new fields.
Association/explicit refresh, draft retention, IDs, handout choices and saved
history remain unchanged. No database migration or schema-version bump.

Use one safe renderer across editor preview, deck preview, presenter, handout
and PDFs, with escaped content and no executable markup. Reject control
characters, credentials, unsafe schemes and mail header injection. Student
sanitization uses the same URL validator, including narrowly allowed mailto;
retain CSP, sandbox restrictions and SVG animation removal. Email activation
depends on the user's configured mail handler.

Three-column visual slide at presentation/print widths; stacked readable cards
in a narrow student view and live editor preview. Keep native keyboard links,
44px student/editor targets, focus styles, existing light/dark authoring tokens
and no overflow. PDF URI annotations must retain web and mailto destinations.

The structured approach is chosen over guessing categories from free text or
requiring more Markdown: it directly represents the user's seven requested
resources. Detailed layout beyond these cards is not added.
