export async function currentPresenterOwner(): Promise<string> {
  const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Sign in to Lesson Builder again to resume this presenter.");
  const identity = await response.json();
  if (!identity.ok || !identity.actorId || !identity.effectiveId) {
    throw new Error("Could not verify the presenter account. Return to Builder and try again.");
  }
  return `${identity.actorId}:${identity.effectiveId}`;
}
