# Preview test guide: saving, linked banks, presenter archive and A4 cover

Use the authenticated **Preview** link from the handoff, on both laptops and on the tablet. Sign in to the same **staging** teacher account on all three. Create disposable test classes and lessons; do not test by changing a live class, lesson, or skill. Preview data is separate from production, so your real classes and lessons might not appear. You can create `Preview IGCSE` and `Preview Further Maths` in place of `10Ma1` and `9L2FM`.

## 1. Save and reopen on two laptops

1. On laptop A create a test lesson for `Preview IGCSE`. Give it an overall LO and a teaching date. Add a Starter with images, a worked Example and a third slide. Tick a couple of slides for Handout. Note the title, class, date and slide order/count.
2. Click the **Save** button in the top bar. Wait for the save to finish. Reload, then open the lesson from **Saved lessons**. Verify the exact slide count/order, images, LO, class and Handout ticks. On laptop B open the same lesson and check all six again.
3. On A add a slide and save. If you can make another edit while saving (an image-heavy deck or slower connection helps), check that the later edit still shows as unsaved or is saved by a subsequent save. Click **Save** again before testing the second laptop. Reopen on B and verify the later edit is present.
4. For the conflict check, open the same saved revision on both laptops. On A add a slide named `Laptop A` and save. Without reloading B, make a different change there and press **Save**. It should warn that the saved lesson changed instead of silently overwriting A. Use the copy option offered in the conflict prompt to keep B's changes as a separate lesson. Reopen the original and the copy: the original must keep `Laptop A`; the copy must keep B's work. Stop if either version is unexpectedly empty or overwritten.

## 2. Link the banks, check the overdue counts, and generate retrieval

1. Create `Preview Further Maths` and open the lesson linked to `Preview IGCSE`. In **Retrieval**, use **Class to link** to select `Preview Further Maths`, then click **Link retrieval banks**. The top bar should show two separately named overdue counts across planning tabs.
2. Seed a few entries in each bank (see section 3). Use a teaching date comfortably later than the last-taught dates so you can test overdue entries, then try an earlier teaching date. The counts should follow the lesson teaching date and match the same bank's Retrieval view, not today or a combined count.
3. Confirm the **Retrieval bank** selector starts on `Preview IGCSE`. Select a few entries with images and add them using the **4-per-slide** layout. Switch to `Preview Further Maths`, select its entries and do the same. Both sets of slides should appear, up to four questions per slide, without the lesson class changing from `Preview IGCSE` or any automatic increase in seen counts.
4. Switch banks with skills still selected in one bank. **Log selected** should only act on the visible bank's selected skills and deselect them after success. Check the other bank's seen counts remain unchanged. Save and reopen: the class and both generated sets of slides should persist.
5. On B (reload after A has synced), verify the pair is available. Open a separate lesson in `Preview Further Maths`: it should default to that bank with `Preview IGCSE` as its partner. An unrelated class should still have the single normal overdue badge. If practical, link a second pair, then unlink the original pair; only that pair's link should disappear. No bank entries or history should change. Re-link the original pair before the next tests if you unlinked it.
6. To check cross-device recovery, leave B open with the pair. Unlink on A and wait for workspace sync. On B make an unrelated lesson edit, then reload after the browser has kept that edit. The edit should survive recovery without restoring the stale link. Re-link before continuing.

## 3. Save Examples to the right retrieval bank

1. On the `Preview IGCSE` lesson, open **Example**. Next to the retrieval save action, verify **Retrieval bank** defaults to `Preview IGCSE`, even if you just browsed `Preview Further Maths` in Retrieval.
2. Enter a skill (for example `191a` if it exists on staging) and load its retrieval images, or add your own test question and answer images. Save using **Add LO to retrieval bank**. Use the drop-down to save the same skill to `Preview Further Maths`. Check the status names the intended destination each time; the lesson class should never change.
3. Verify the skill is tracked in both banks. Repeat for just one bank, and check any duplicate confirmation names that bank. Check progress in the other bank did not change. Switching banks while the LO lookup is in progress must not show the old bank's result or discard your example draft.
4. With the same skill tracked in both banks, explicitly replace or clear a retrieval image. Check the save warns that this private image change can affect both banks. Cancel to verify no write; only accept if testing with disposable images. A normal save without image edits should leave the images alone. Open another lesson and check the destination resets to its own bank.
5. For a stale-tab check, leave Example open on B. On A add or advance that skill in `Preview Further Maths`. On B save it to that same destination and accept the duplicate confirmation. The date and spacing may update; the seen count and current image slot from A must not reset.

## 4. Archive the right skill from Presenter

1. Use a test skill already tracked in both linked banks. Generate one retrieval slide from each bank, save the lesson, and click **Present**. Add some ink to the slide. Find the bin beside `+1`, `−1`, and **New question** in a tracked question's quadrant.
2. Open the bin on the Further Maths question. The confirmation should name the skill and `Preview Further Maths` and say that the question stays on the slide. Cancel or press Escape. Verify the question and controls still work and both versions of the skill remain in their banks.
3. Open a second Presenter tab for the same lesson before confirming the archive in the first. Confirm the archive in the first tab. Its question, answer and ink should stay in place; the archived question's live controls should turn off. The IGCSE version and other questions should still work. On returning to Builder, verify only the Further Maths entry is gone from active retrieval, and its count decreased if the item was overdue.
4. Try `+1` or **New question** on the archived entry from the second, stale tab. It must not recreate the entry or change the other bank. If you have a recovered Presenter tab (e.g. after app-switching on your tablet), verify the same. Open student view and verify it has no bin or teacher retrieval controls.

## 5. Print the A4 Starter cover

1. Give a test Starter four question images, including one tall image, and set the lesson's overall LO. Select only that slide for Handout. Click **Handout**, then **A4 booklet cover** in the new tab. If the tab does not open, allow pop-ups for the Preview host.
2. Open browser print preview with paper set to **A4 portrait**, normal scale, and browser headers/footers off. Expect exactly one page: large overall LO, smaller lesson title, bold date, four questions with numbers and any skill codes, blank working space under each, no answers, no glue panel and no second copy. Check the tall image is not clipped.
3. Select the Starter plus a worked Example and another printable slide. Choose **A4 booklet cover** again. The same cover should be page 1; the other content should follow in deck order. For a handout of more than two pages, try **Add glue margins** and print duplex, flip on the long edge: the cover and page 2 remain unchanged, then the extra edge allowance alternates left/right on pages 3/4 onward.
4. Repeat with **Existing layout**: Starter-only retains the two-sided duplicated folded booklet, and mixed selections retain the usual Starter/GLUE layout. An Examples- or Retrieval-only handout should not ask for a starter layout.

If anything fails, send the Preview URL, browser/device, test number, test lesson and class names, exact click sequence, and a screenshot of the result (or print preview). For saving, include which device saved and in what order; for retrieval, include the skill code and source bank. No production promotion is part of this Preview test.
