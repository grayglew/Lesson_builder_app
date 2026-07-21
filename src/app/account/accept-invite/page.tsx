"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type InviteState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string };

export default function AcceptInvitePage() {
  const [supabase] = useState(createClient);
  const [state, setState] = useState<InviteState>({
    status: "loading",
    message: "Confirming your invitation…",
  });

  useEffect(() => {
    async function acceptInvite() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const errorDescription = hash.get("error_description");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      window.history.replaceState(null, "", window.location.pathname);

      if (errorDescription) {
        setState({ status: "error", message: errorDescription });
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setState({ status: "error", message: error.message });
          return;
        }
      }

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setState({
          status: "error",
          message: "This invitation is invalid or has expired. Ask an administrator to send a new invitation.",
        });
        return;
      }

      window.location.replace("/account/update-password");
    }

    void acceptInvite();
  }, [supabase]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-teal-700 text-white">
            <KeyRound size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">
              {state.status === "loading" ? "Accepting invitation" : "Invitation unavailable"}
            </h1>
            <p className="text-sm text-slate-500">{state.message}</p>
          </div>
        </div>

        {state.status === "loading" ? (
          <div
            aria-label="Confirming invitation"
            className="h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
          >
            <div className="h-full w-1/2 animate-pulse rounded-full bg-teal-700" />
          </div>
        ) : (
          <a
            className="inline-flex h-11 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
            href="/login"
          >
            Return to sign in
          </a>
        )}
      </section>
    </main>
  );
}
