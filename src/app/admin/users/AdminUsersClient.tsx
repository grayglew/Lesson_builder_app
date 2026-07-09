"use client";

import { useEffect, useMemo, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "teacher";
  status: "active" | "inactive";
  createdAt: string | null;
  lastSignInAt: string | null;
  deactivatedAt: string | null;
};

type AdminUsersClientProps = {
  currentUserId: string;
  currentUserEmail: string;
};

type ApiResult = {
  ok: boolean;
  error?: string;
  users?: AdminUser[];
};

export default function AdminUsersClient({ currentUserId, currentUserEmail }: AdminUsersClientProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.email.localeCompare(b.email);
      }),
    [users],
  );

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load users.");
      setUsers(data.users || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  async function postAction(path: string, body: Record<string, unknown>, successMessage: string) {
    setBusy(path);
    setError("");
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok) throw new Error(data.error || "Action failed.");
      setMessage(successMessage);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function inviteTeacher() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter an email address first.");
      return;
    }
    await postAction("/api/admin/users/invite", { email: trimmed }, `Invite sent to ${trimmed}.`);
    setEmail("");
  }

  async function resetPassword(user: AdminUser) {
    await postAction(
      "/api/admin/users/reset-password",
      { userId: user.id },
      `Reset password email sent to ${user.email}.`,
    );
  }

  async function setStatus(user: AdminUser, status: "active" | "inactive") {
    await postAction(
      "/api/admin/users/status",
      { userId: user.id, status },
      `${user.email} is now ${status}.`,
    );
  }

  async function setRole(user: AdminUser, role: "admin" | "teacher") {
    await postAction(
      "/api/admin/users/role",
      { userId: user.id, role },
      `${user.email} is now ${role === "admin" ? "an admin" : "a teacher"}.`,
    );
  }

  async function viewAs(user: AdminUser) {
    setBusy(`/api/admin/impersonation/start:${user.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = (await response.json()) as ApiResult;
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not start teacher view.");
      window.location.href = "/builder/index.html";
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "Could not start teacher view.");
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 grid gap-3 border-b border-slate-200 pb-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Invite teacher
          <input
            className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teacher@example.com"
          />
        </label>
        <button
          className="h-11 self-end rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={Boolean(busy)}
          onClick={inviteTeacher}
        >
          Invite teacher
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-slate-500">Signed in as {currentUserEmail || "admin"}.</p>
        </div>
        <button
          className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          type="button"
          onClick={loadUsers}
        >
          Refresh
        </button>
      </div>

      {message ? <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</div> : null}
      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      {loading ? (
        <p className="py-8 text-sm text-slate-500">Loading users...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Last sign in</th>
                <th className="py-3 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => {
                const isSelf = user.id === currentUserId;
                const disabled = Boolean(busy) || isSelf;
                return (
                  <tr key={user.id} className={user.status === "inactive" ? "border-b border-slate-100 bg-slate-50 text-slate-500" : "border-b border-slate-100"}>
                    <td className="py-4 pr-4 font-medium text-slate-900">{user.email}</td>
                    <td className="py-4 pr-4 capitalize">{user.role}</td>
                    <td className="py-4 pr-4 capitalize">{user.status}</td>
                    <td className="py-4 pr-4">{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50" type="button" disabled={Boolean(busy)} onClick={() => resetPassword(user)}>
                          Reset password
                        </button>
                        {user.status === "active" ? (
                          <button className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50" type="button" disabled={disabled} onClick={() => setStatus(user, "inactive")}>
                            Deactivate
                          </button>
                        ) : (
                          <button className="rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 disabled:opacity-50" type="button" disabled={Boolean(busy)} onClick={() => setStatus(user, "active")}>
                            Reactivate
                          </button>
                        )}
                        {user.role === "admin" ? (
                          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50" type="button" disabled={disabled} onClick={() => setRole(user, "teacher")}>
                            Remove admin
                          </button>
                        ) : (
                          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50" type="button" disabled={Boolean(busy)} onClick={() => setRole(user, "admin")}>
                            Make admin
                          </button>
                        )}
                        <button className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" type="button" disabled={Boolean(busy) || isSelf || user.status !== "active"} onClick={() => viewAs(user)}>
                          View as
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
