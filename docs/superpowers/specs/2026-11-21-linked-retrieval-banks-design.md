# Linked retrieval banks, presenter archive, and A4 starter cover

Status: proposed for approval. Preview only; do not promote to production.

## Intent

One teaching group follows two curricula: IGCSE (`10Ma1`) and AQA Level 2 Further Maths (`9L2FM`). The teacher needs a reminder when either curriculum has overdue retrieval and a way to add four-question retrieval slides, save examples, and retire a skill in the correct bank without temporarily reassigning the lesson. They also need to print a starter as the front cover of an A4 booklet. Existing lessons and the two banks' scheduling and progress must stay separate.

## Approaches

- A general bank switcher would decouple retrieval from the lesson's class and work with any bank, but the teacher would still need to remember to check the other curriculum.
- Linked banks, the chosen approach, add an explicit relationship and surface both banks' overdue counts. This adds a small amount of shared workspace state but does not require a new curriculum hierarchy or moving any progress records.
- Infer an Example's destination from the last browsed bank, or show an explicit destination beside the save action. Use the explicit destination: it defaults safely to the lesson's own bank and avoids a silent carry-over from another tool.
- The current starter-only printout is imposed for folding and includes a glue panel. Offer a separate, full A4 portrait cover rather than replacing that format or producing two A5 covers per sheet. A4 is the teacher's booklet size; the larger sheet also leaves room for working.
- Archive the originating class entry instead of deleting the shared key skill or making the question vanish from the current slide. Reuse the existing class-progress archive behaviour with a confirmation and a stricter exact-entry check for the presenter.

## Proposed behaviour

- Allow the teacher to pair any two existing classes and to unlink them. The link works both ways and is saved for future lessons on either laptop. The first version allows one partner per class, with any number of independent pairs. Nothing is hard-coded to the two example classes. Linking or unlinking never changes class assignments, retrieval content, or progress.
- Use the existing lesson-date due rule to show a separate overdue count for each linked bank in the Builder header throughout planning the open lesson. Do not add counts to saved-lesson library rows. An unlinked class behaves as before.
- In Retrieval, default to the open lesson's own bank and let the teacher select its partner as the source. That choice only affects the Retrieval tool; it never edits the lesson's class, even across Save or reopen. Switching banks must not act on hidden selections. Keep the existing four-questions-per-slide action and allow the teacher to run it for either bank within one lesson.
- In linked mode, only count and select entries actually assigned to the bank being viewed. Classless entries stay available through the existing all-classes view but are not counted twice or implicitly assigned to either partner. Do not change existing filtering for unlinked classes.
- Generated questions retain their originating bank and specific progress item. Image advancement and manual or presenter logging affect that bank only, even if the same skill is tracked in both banks. Generating slides does not start logging seen counts automatically. Legacy slides and unlinked workflows retain their existing behaviour.
- Store the pair as a private workspace setting, not as lesson metadata or a new progress category. Preserve it through ordinary workspace recovery, opening and creating lessons, and renaming a linked class. A successful class archive unlinks the pair; adding the class back later does not restore the link. Do not restore an obsolete link just because an older lesson is reopened.

### Example destination

- When the lesson class has a linked bank, show the destination for **Add LO to retrieval bank** and allow switching between the two banks. Opening another lesson resets the destination to that lesson's own bank. Browsing the other bank in Retrieval does not set the Example destination. Unlinked classes keep the current workflow.
- Use the selected destination for the class-tracking lookup, duplicate confirmation and save. Only accept the lookup result for the current objective and destination. Capture and display the target of the pending save so a delayed response cannot be applied to a different bank or lesson. Keep the authored example draft when changing destination, and keep editing existing slides separate from changing retrieval progress.
- Save or update the selected class's progress only. Existing shared key-skill content and teacher-level image overrides are not duplicated per class. A normal save without image edits leaves both banks' shared image source alone. If explicitly changing a teacher-wide image override for a skill tracked in both banks, say so before writing it; the canonical Doctor Frost images remain unchanged. No class-specific image-storage redesign.

### Archive from Presenter

- Add a bin beside `+1`, `−1`, and **New question** for a question with a specific, active bank entry. Confirmation names the skill and bank and explains that the existing question stays on the slide. Cancel or Escape writes nothing.
- On confirmation, archive that exact owned progress entry, never a lookup by skill wording or shared content ID. A different class tracking the same code stays unchanged. Never delete canonical skill content, images, or annotations. Hide the action for loose/manual questions without an identifiable bank entry and for student/standalone views without the live teacher connection.
- While archiving, prevent duplicate submissions. On success, keep the displayed question/answer and ink; disable that entry's live controls in this presenter and refresh active-bank data and overdue counts on return to Builder. On failure, report it and leave the controls usable. A stale or recovered presenter must not recreate the archived entry by logging or loading another question; an intentional later Add to retrieval bank can follow the existing reactivation policy.

### A4 starter front cover

- Offer **A4 booklet cover** in the existing handout flow when one core Starter is selected. Keep the current layout as the default and keep the choice local to each generation. No change to slide selection, lesson metadata, presenter, or lesson PDF bundles.
- The cover is a single portrait A4 page, with the existing lesson header (prominent overall LO, smaller lesson title, bold teaching date) and only the Starter's question images. Use a two-by-two grid with the images near the top of each cell and reserve blank writing room beneath each. Keep question numbers and available key-skill codes; fit tall images without clipping or swallowing the working area. The cover itself has no glue panel or glue inset.
- Starter-only in cover mode produces exactly one page, without a folding template, duplicate copies, or a blank reverse. If other printable slides are selected, the cover is page one and those slides follow in their original relative order; render none of them on the cover. Preserve the existing multiple-Starter validation and optional additional-sheet margins for eligible later pages. The existing starter-only folded booklet and standard mixed layouts remain available unchanged.

## Verification and rollout

- Build and verify in separable slices: linked bank and Example flows; presenter archive using exact bank-entry provenance; optional A4 cover. Keep all new changes in a single authenticated staging-backed Preview based on the verified saving fixes. Leave the current saving-fix deployment and production unchanged. Do not copy production data for this test.
- Deliver a manual test guide with exact actions, expected results, and what to capture if a check fails. Use disposable staging lessons and bank entries, including a skill tracked in both banks.
- Saving: use top-bar Save, reload and reopen on a second laptop, count slides and check images, LO and class; verify edits during upload remain unsaved; verify a stale second-laptop save is refused and Save copy preserves its changes; check the original remains intact. Keep the existing save-safety regressions passing.
- Linked retrieval: pair test classes, check both counts at the lesson's teaching date from either side, confirm link survives on a second browser, and verify unrelated/unlinked classes are unchanged. Generate from both banks in one lesson, use Log selected, save and reopen, and verify the original class, four-question layout, and originating banks. Create a second independent pair and unlink one without changing its bank history.
- Examples: explicitly target each bank in turn while keeping the lesson class unchanged. Confirm class-specific tracked status and duplicate confirmation, correct progress and spacing, no wrong-bank updates while changing selection during lookup, and no surprise changes to shared images. Verify the destination reverts to the lesson bank when opening a different lesson.
- Presenter: cancel an archive and verify both entries remain; confirm for one bank and verify only that entry leaves active retrieval and the overdue count updates. Verify the slide/ink stays intact; test repeated action, rejected archive and a stale presenter after archiving. Confirm other skills, the other bank's same code, and student view still work as intended.
- Print: in A4 print preview, generate a Starter-only cover and a mixed handout, include a tall question image, and check page count, header, all four working areas and no clipping, bleed or glue on the cover. Check both default layouts and optional margins on later sheets.
