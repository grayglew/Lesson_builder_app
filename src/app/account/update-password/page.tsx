import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

type UpdatePasswordPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/account/update-password");

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-teal-700 text-white">
            <KeyRound size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Choose a new password</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>

        {params.message ? (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {params.message}
          </div>
        ) : null}

        <form action={updatePassword} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            New password
            <input
              className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Confirm password
            <input
              className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="inline-flex h-11 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800">
            Update password
          </button>
        </form>
      </section>
    </main>
  );
}
