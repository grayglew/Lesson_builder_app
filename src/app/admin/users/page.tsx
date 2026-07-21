import { redirect } from "next/navigation";
import { getAuthorizedAppContext } from "@/lib/auth/app-users";
import { BUILDER_ENTRY_PATH } from "@/lib/builder/access";
import { AdminRecoveryExport } from "./AdminRecoveryExport";
import AdminUsersClient from "./AdminUsersClient";

export default async function AdminUsersPage() {
  const context = await getAuthorizedAppContext();
  if ("response" in context) redirect("/login?next=/admin/users");
  if (context.actorProfile.role !== "admin") redirect(BUILDER_ENTRY_PATH);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-700">
              Admin dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Teacher users</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Invite teachers, reset passwords by email, deactivate accounts, grant admin rights,
              and enter a full-edit teacher workspace view.
            </p>
          </div>
          <a
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400"
            href={BUILDER_ENTRY_PATH}
          >
            Back to builder
          </a>
        </div>

        <AdminRecoveryExport />
        <AdminUsersClient currentUserId={context.actorUser.id} currentUserEmail={context.actorUser.email || ""} />
      </div>
    </main>
  );
}
