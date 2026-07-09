import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(pathParts) {
  return readFileSync(resolve(root, ...pathParts), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function latestMigrationContaining(text) {
  const migrationsDir = resolve(root, "supabase", "migrations");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, sql: readFileSync(resolve(migrationsDir, file), "utf8") }))
    .filter(({ sql }) => sql.includes(text))
    .at(-1);
}

const migration = latestMigrationContaining("create table if not exists public.app_users");
assert(migration, "A migration should create the app_users admin/teacher profile table.");
assert(migration.sql.includes("admin_audit_log"), "The admin migration should create an audit log table.");
assert(migration.sql.includes("admin_impersonation_sessions"), "The admin migration should create impersonation sessions.");
assert(migration.sql.includes("grayglew@gmail.com"), "The admin migration should seed grayglew@gmail.com as the first admin.");
assert(migration.sql.includes("restore_admin_dashboard_20260709_075349") === false, "Restore schema names should not leak into forward migrations.");
assert(migration.sql.includes("app_private.is_active_app_user"), "RLS should use an active-user authorization helper.");
assert(migration.sql.includes("drop policy") && migration.sql.includes("storage.objects"), "The migration should replace legacy hard-coded storage policies.");

const appUsersHelperPath = resolve(root, "src", "lib", "auth", "app-users.ts");
assert(existsSync(appUsersHelperPath), "A DB-backed app user auth helper should exist.");
const appUsersHelper = read(["src", "lib", "auth", "app-users.ts"]);
assert(appUsersHelper.includes("ADMIN_EMAIL") && appUsersHelper.includes("grayglew@gmail.com"), "The helper should define the initial admin email.");
assert(appUsersHelper.includes("IMPERSONATION_COOKIE"), "The helper should define the impersonation cookie.");
assert(appUsersHelper.includes("getAuthorizedAdminContext"), "The helper should expose an admin-only context guard.");
assert(appUsersHelper.includes("resolveEffectiveUser"), "The helper should resolve admin view-as sessions.");

const builderAuth = read(["src", "lib", "builder-sync", "auth.ts"]);
assert(builderAuth.includes("effectiveUser") && builderAuth.includes("isImpersonating"), "Builder auth should expose effective user and impersonation state.");
assert(!builderAuth.includes("isAllowedUser"), "Builder auth should not use the old hard-coded allowed user check.");

const proxy = read(["src", "lib", "supabase", "proxy.ts"]);
assert(proxy.includes("pathname.startsWith(\"/admin\")"), "Middleware should protect admin routes.");
assert(proxy.includes("role !== \"admin\""), "Middleware should require admin role for admin pages.");

const loginActions = read(["src", "app", "login", "actions.ts"]);
assert(!loginActions.includes("isAllowedUser"), "Login should not use the old hard-coded allowed-user list.");
assert(loginActions.includes("getAppUserProfile"), "Login should check the DB-backed app user profile.");

const meRoute = read(["src", "app", "api", "me", "route.ts"]);
assert(meRoute.includes("isImpersonating") && meRoute.includes("actorEmail") && meRoute.includes("effectiveEmail"), "/api/me should expose safe impersonation display data.");

for (const pathParts of [
  ["src", "app", "admin", "users", "page.tsx"],
  ["src", "app", "admin", "users", "AdminUsersClient.tsx"],
  ["src", "app", "api", "admin", "users", "route.ts"],
  ["src", "app", "api", "admin", "users", "invite", "route.ts"],
  ["src", "app", "api", "admin", "users", "reset-password", "route.ts"],
  ["src", "app", "api", "admin", "users", "status", "route.ts"],
  ["src", "app", "api", "admin", "users", "role", "route.ts"],
  ["src", "app", "api", "admin", "impersonation", "start", "route.ts"],
  ["src", "app", "api", "admin", "impersonation", "stop", "route.ts"],
]) {
  assert(existsSync(resolve(root, ...pathParts)), `${pathParts.join("/")} should exist.`);
}

const adminClient = read(["src", "app", "admin", "users", "AdminUsersClient.tsx"]);
assert(adminClient.includes("Invite teacher"), "The admin dashboard should let admins invite teachers.");
assert(adminClient.includes("Reset password"), "The admin dashboard should let admins trigger password reset emails.");
assert(adminClient.includes("Deactivate") && adminClient.includes("Reactivate"), "The admin dashboard should support reversible deactivation.");
assert(adminClient.includes("Make admin") && adminClient.includes("Remove admin"), "The admin dashboard should support admin role changes.");
assert(adminClient.includes("View as"), "The admin dashboard should support teacher impersonation.");

const appJs = read(["public", "builder", "app.js"]);
assert(appJs.includes("isImpersonating") && appJs.includes("Acting as"), "The builder shell should display a clear impersonation banner.");

console.log("Admin dashboard regression checks passed.");
