export const PRIMARY_USER_ID = "225f2092-e96f-4065-bf8f-0d68d7c3cf78";
export const PRIMARY_USER_EMAIL = "grayglew@gmail.com";
export const SECONDARY_USER_EMAIL = "sxia@dbis.edu.hk";

export const ALLOWED_USER_EMAILS = [PRIMARY_USER_EMAIL, SECONDARY_USER_EMAIL] as const;
export const ALLOWED_USER_EMAILS_LABEL = ALLOWED_USER_EMAILS.join(" or ");

export function isAllowedUser(user: { id: string; email?: string | null } | null | undefined) {
  if (!user) return false;
  if (user.id === PRIMARY_USER_ID) return true;
  return ALLOWED_USER_EMAILS.includes(String(user.email || "").toLowerCase() as (typeof ALLOWED_USER_EMAILS)[number]);
}

export function isPrimaryUser(user: { id: string; email?: string | null } | null | undefined) {
  return isAllowedUser(user);
}
