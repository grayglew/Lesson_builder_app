import { extractPresenterSource } from "./session-document";
import { createPresenterSession } from "./session-storage";
import { currentPresenterOwner } from "./session-identity";

export async function openRecoverablePresenter(previewWindow: Window, html: string): Promise<void> {
  const owner = await currentPresenterOwner();
  const source = extractPresenterSource(html);
  const sessionId = await createPresenterSession(owner, source);
  previewWindow.location.replace(`/builder/presenter/${sessionId}`);
}
