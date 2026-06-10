import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Confirmation link expired</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Ask Supabase to send a fresh sign-up or recovery link, then open it in this browser.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
