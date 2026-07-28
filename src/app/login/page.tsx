import { LogIn } from "lucide-react";
import { normalizeBuilderReturnPath } from "@/lib/builder/access";
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
    <main className="grid min-h-screen grid-cols-1 bg-[#e7e9e5] text-[#1d2723] lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1fr)]">
      <section className="hidden border-r border-[#35433d] bg-[#1d2723] px-12 py-10 text-[#f7f8f6] lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <BuilderMark />
          <span className="text-lg font-semibold">Lesson Builder</span>
        </div>
        <div className="max-w-xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#8ed0c0]">
            Teacher workspace / secure access
          </p>
          <h1 className="mt-4 max-w-[13ch] text-5xl font-semibold leading-[1.03] tracking-[-0.025em]">
            Build lessons, autosave them, and export the same polished resources from anywhere.
          </h1>
          <p className="mt-5 max-w-[56ch] text-base leading-7 text-[#bdc8c3]">
            This version keeps the local Lesson Builder workflow but stores lessons, retrieval
            practice, assets, and backups in your Supabase project.
          </p>
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.1em] text-[#8d9d96]">Private by default / Export when ready</div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md border border-[#aeb8b3] border-t-[3px] border-t-[#247563] bg-white p-7 shadow-[0_18px_50px_rgba(29,39,35,0.12)]">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-3">
              <BuilderMark />
              <span className="text-lg font-semibold">Lesson Builder</span>
            </div>
          </div>

          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#247563]">Account access</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This private workspace is restricted to active teacher accounts.
          </p>

          {params.message ? (
            <div className="mt-5 border border-[#9dcbbf] bg-[#edf7f3] px-4 py-3 text-sm text-[#155b4d]">
              {params.message}
            </div>
          ) : null}

          <form action={signIn} className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={normalizeBuilderReturnPath(params.next)} />
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Email
              <input
                className="h-11 border border-[#aeb8b3] px-3 outline-none transition focus:border-[#247563] focus:ring-2 focus:ring-[#d9eee8]"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Password
              <input
                className="h-11 border border-[#aeb8b3] px-3 outline-none transition focus:border-[#247563] focus:ring-2 focus:ring-[#d9eee8]"
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            <button className="inline-flex h-11 items-center justify-center gap-2 bg-[#247563] px-4 text-sm font-semibold text-white transition hover:bg-[#195a4c]">
              <LogIn size={17} />
              Sign in
            </button>
          </form>

          <div className="mt-4 border border-[#d2d8d4] bg-[#f2f4f2] px-4 py-3 text-sm text-slate-600">
            New email sign-ups are disabled.
          </div>
        </div>
      </section>
    </main>
  );
}

function BuilderMark() {
  return (
    <span className="grid size-10 place-items-center border border-[#35433d] bg-[#1d2723] text-white" aria-hidden>
      <svg className="size-6 fill-current" viewBox="0 0 32 32">
        <path d="M6 6h15v4H10v12h11v4H6z" />
        <path d="M17 12h9v14h-9v-4h5v-6h-5z" />
        <path className="fill-[#dc6d57]" d="m19 6 7 7h-7z" />
      </svg>
    </span>
  );
}
