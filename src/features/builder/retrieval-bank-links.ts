export type RetrievalBankLink = [string, string];

type WorkspaceBankLinks = {
  linkedRetrievalBanks: RetrievalBankLink[];
  retrievalBankLinksUpdatedAt: string;
};

// Resolve links separately from the lesson. A newer slide edit isn't a newer link edit.
export function selectWorkspaceRetrievalBankLinks(local: WorkspaceBankLinks, remote: WorkspaceBankLinks): WorkspaceBankLinks {
  const version = (value: string) => Date.parse(value) || 0;
  const selected = version(local.retrievalBankLinksUpdatedAt) > version(remote.retrievalBankLinksUpdatedAt) ? local : remote;
  return {
    linkedRetrievalBanks: selected.linkedRetrievalBanks,
    retrievalBankLinksUpdatedAt: selected.retrievalBankLinksUpdatedAt,
  };
}

export function retrievalBankKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getLinkedBank(links: readonly RetrievalBankLink[], className: string) {
  const key = retrievalBankKey(className);
  for (const [left, right] of links) {
    if (retrievalBankKey(left) === key) return right;
    if (retrievalBankKey(right) === key) return left;
  }
}

export function normalizeRetrievalBankLinks(input: unknown, classes?: readonly string[]): RetrievalBankLink[] {
  if (!Array.isArray(input)) return [];
  const allowed = classes && new Map(classes.map(name => [retrievalBankKey(name), name]));
  const used = new Set<string>();
  const result: RetrievalBankLink[] = [];
  for (const pair of input) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || typeof pair[1] !== "string") continue;
    const [left, right] = pair;
    const a = retrievalBankKey(left), b = retrievalBankKey(right);
    if (!a || !b || a === b || used.has(a) || used.has(b) || (allowed && (!allowed.has(a) || !allowed.has(b)))) continue;
    used.add(a);
    used.add(b);
    result.push([allowed?.get(a) ?? left.trim(), allowed?.get(b) ?? right.trim()]);
  }
  return result;
}
