/** One writer per recovery address; opening Present again creates an independent address. */
export async function claimPresenterSession(id: string): Promise<() => void> {
  if (!navigator.locks) throw new Error("This browser cannot protect presenter recovery. Update your browser and reopen the lesson from Builder.");
  return new Promise((resolve, reject) => {
    void navigator.locks.request(`lesson-presenter:${id}`, { ifAvailable: true }, async lock => {
      if (!lock) {
        reject(new Error("This presenter is already open in another tab. Close that tab and reload this one, or open a separate presenter from Builder."));
        return;
      }
      await new Promise<void>(release => resolve(release));
    }).catch(reject);
  });
}
