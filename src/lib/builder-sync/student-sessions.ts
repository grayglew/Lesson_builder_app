import { createHmac, randomInt } from "node:crypto";
import { PRESENTER_SIGNED_URL_SECONDS } from "@/lib/builder-sync/signed-url-expiry";

const STUDENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const STUDENT_SESSION_SECONDS = PRESENTER_SIGNED_URL_SECONDS;
export const STUDENT_SNAPSHOT_SIGNED_URL_SECONDS = 15 * 60;

export type PresentationSessionRow = {
  id: string;
  owner_id: string;
  source_lesson_id: string;
  code_hash: string;
  bucket: string;
  snapshot_path: string | null;
  snapshot_byte_size: number;
  snapshot_version: number;
  expires_at: string;
  last_uploaded_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeStudentSessionCode(value: unknown) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

export function formatStudentSessionCode(value: string) {
  const normalized = normalizeStudentSessionCode(value).slice(0, 6);
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

export function randomStudentSessionCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += STUDENT_CODE_ALPHABET[randomInt(0, STUDENT_CODE_ALPHABET.length)];
  }
  return formatStudentSessionCode(code);
}

export function hashStudentSessionCode(value: unknown) {
  const normalized = normalizeStudentSessionCode(value);
  const secret = String(process.env.STUDENT_SESSION_CODE_SECRET || "").trim();
  if (!secret) {
    throw new Error("Student sharing is not configured.");
  }
  return createHmac("sha256", secret).update(normalized).digest("hex");
}

export function studentSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + STUDENT_SESSION_SECONDS * 1000).toISOString();
}

export function isExpiredSession(row: Pick<PresentationSessionRow, "expires_at" | "closed_at">) {
  return !!row.closed_at || new Date(row.expires_at).getTime() <= Date.now();
}
