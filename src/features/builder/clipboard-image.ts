export type ClipboardImageData = Pick<DataTransfer, "files" | "items">;

export function firstClipboardImage(
  clipboardData: ClipboardImageData | null | undefined,
): File | null {
  if (!clipboardData) return null;

  const file = Array.from(clipboardData.files || []).find((candidate) =>
    candidate.type.startsWith("image/"),
  );
  if (file) return file;

  for (const item of Array.from(clipboardData.items || [])) {
    if (!item.type.startsWith("image/")) continue;
    const candidate = item.getAsFile();
    if (candidate) return candidate;
  }
  return null;
}
