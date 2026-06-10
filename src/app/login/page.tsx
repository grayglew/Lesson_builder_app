import { BookOpen, LogIn } from "lucide-react";
import { ALLOWED_USER_EMAILS_LABEL } from "@/lib/auth/primary-user";
import { signIn } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen grid-cols-1 bg-slate-50 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1fr)]">
      <section className="hidden border-r border-slate-200 bg-white px-12 py-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-slate-950">
          <span className="grid size-10 place-items-center rounded-md bg-blue-600 text-white">
            <BookOpen size={21} />
          </span>
          <span className="text-lg font-semibold">Lesson Builder</span>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">
            Online workspace
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.03] tracking-normal text-slate-950">
            Build lessons, autosave them, and export the same polished resources from anywhere.
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            This version keeps the local Lesson Builder workflow but stores lessons, retrieval
            practice, assets, and backups in your Supabase project.
          </p>
        </div>
        <div className="text-sm text-slate-500">Private by default. Export when you are ready.</div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-blue-600 text-white">
                <BookOpen size={21} />
              </span>
              <span className="text-lg font-semibold">Lesson Builder</span>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-normal">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This private workspace is restricted to {ALLOWED_USER_EMAILS_LABEL}.
          </p>

          {params.message ? (
            <div className="mt-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {params.message}
            </div>
          ) : null}

          <form action={signIn} className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={params.next || "/builder/index.html"} />
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Email
              <input
                className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Password
              <input
                className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700">
              <LogIn size={17} />
              Sign in
            </button>
          </form>

          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            New email sign-ups are disabled.
          </div>
        </div>
      </section>
    </main>
  );
}
