"use client";

import { useEffect, useRef, useState } from "react";
import { renderPresenterSession, createCheckpointPreparer } from "./session-document";
import { readPresenterSession, writePresenterCheckpoint, markPresenterOpened } from "./session-storage";
import { currentPresenterOwner } from "./session-identity";
import { claimPresenterSession } from "./session-lock";
import type { PresenterCheckpoint, RecoverablePresenterWindow } from "./session-types";

/** Durable app URL; the iframe retains the existing presenter layout and runtime. */
export function PresenterSession({ owner, sessionId }: { owner: string; sessionId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const detach = useRef<() => void>(() => {});
  const retryAccount = useRef<() => void>(() => {});
  const revision = useRef(0);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [checkingAccount, setCheckingAccount] = useState(false);

  useEffect(() => {
    let disposed = false;
    let releaseSession = () => {};
    async function load() {
      try {
        if (await currentPresenterOwner() !== owner) throw new Error("This presenter belongs to a different account. Return to Builder.");
        const release = await claimPresenterSession(sessionId);
        if (disposed) { release(); return; }
        releaseSession = release;
        const record = await readPresenterSession(owner, sessionId);
        if (!record) throw new Error("This presenter session is not available on this device. Reopen the lesson from Builder.");
        const firstOpen = await markPresenterOpened(owner, sessionId);
        const checkpoint = record.checkpoint || (firstOpen ? undefined : {
          document: record.source.document, slideId: record.source.document.slides?.[0]?.id || "", slideIndex: 0,
          presentedAt: new Date(record.updatedAt).toISOString(), presentedLessonId: "", presentedLessonTitle: "",
        });
        const restored = renderPresenterSession(record.source, checkpoint);
        if (!disposed) {
          revision.current = record.revision;
          document.title = record.source.document.title || "Lesson presenter";
          setHtml(restored);
        }
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Could not restore this presenter. Reopen the lesson from Builder.");
      }
    }
    void load();
    return () => { disposed = true; detach.current(); releaseSession(); };
  }, [owner, sessionId]);

  function connectFrame() {
    detach.current();
    const element = frame.current;
    const presenter = element?.contentWindow as RecoverablePresenterWindow | null;
    const content = element?.contentDocument;
    if (!presenter?.__lessonPresenterRecovery || !content) {
      setError("The presenter could not start. Reopen the lesson from Builder.");
      return;
    }
    let stopped = false;
    let checking = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let writing = false;
    let queued: { checkpoint: PresenterCheckpoint; revision: number } | undefined;
    const prepareCheckpoint = createCheckpointPreparer();

    function showRecoveryWarning(message: string) {
      // A parent overlay is hidden by the iframe's native fullscreen top layer.
      let notice = content!.getElementById("presenter-recovery-warning");
      if (!notice) {
        notice = content!.createElement("div");
        notice.id = "presenter-recovery-warning";
        notice.setAttribute("role", "alert");
        notice.setAttribute("data-presenter-transient", "true");
        notice.style.cssText = "position:fixed;z-index:10000;bottom:12px;left:12px;right:12px;padding:12px;border:1px solid #9a3412;border-radius:8px;background:#fff7ed;color:#7c2d12;font:16px/1.4 system-ui";
        content!.body.appendChild(notice);
      }
      notice.textContent = message;
      notice.hidden = !message;
    }

    function failed() {
      if (!stopped) {
        dirty = true;
        showRecoveryWarning("Local recovery could not be saved. Keep this tab open and use Save to Builder to protect your work.");
      }
    }
    async function persist() {
      if (writing) return;
      writing = true;
      while (queued && !stopped) {
        const job = queued;
        queued = undefined;
        try {
          const prepared = await prepareCheckpoint(job.checkpoint);
          if (stopped) break;
          await writePresenterCheckpoint(owner, sessionId, prepared, job.revision);
          if (!stopped) showRecoveryWarning("");
        } catch { failed(); }
      }
      writing = false;
    }

    function flush() {
      clearTimeout(timer); clearTimeout(deadline);
      timer = deadline = undefined;
      if (!dirty || stopped || frame.current?.contentWindow !== presenter) return;
      dirty = false;
      // Capture now, while the live frame still exists; serialise asynchronous asset/write work.
      try {
        // Retain only the newest pending snapshot if a slow image/write is still running.
        queued = { checkpoint: presenter!.__lessonPresenterRecovery!.capture(), revision: ++revision.current };
        void persist();
      } catch { failed(); }
    }
    function changed() {
      if (stopped) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
      deadline ??= setTimeout(flush, 1500);
    }
    async function checkAccount() {
      if (checking || stopped) return;
      checking = true;
      setCheckingAccount(true);
      setAccountError("");
      try {
        const currentOwner = await currentPresenterOwner();
        if (stopped) return;
        if (currentOwner !== owner) {
          stopped = true;
          setError("This presenter belongs to a different account. Return to Builder.");
        } else setCheckingAccount(false);
      } catch (cause) {
        // Parent recovery controls must not sit behind the iframe's fullscreen layer.
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        if (!stopped) setAccountError(cause instanceof Error ? cause.message : "Could not verify your account. Check your connection and retry.");
      } finally { checking = false; }
    }
    retryAccount.current = () => { void checkAccount(); };
    function visibilityChanged() {
      if (document.visibilityState === "hidden") flush();
      else void checkAccount();
    }
    content.addEventListener("lessonpresenterchange", changed);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", flush);
    // Record initial presentation time as well, before the first interaction.
    changed();
    detach.current = () => {
      clearTimeout(timer); clearTimeout(deadline);
      stopped = true;
      content.removeEventListener("lessonpresenterchange", changed);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", flush);
    };
  }

  if (error) return <main style={{ padding: 32, maxWidth: 680, margin: "auto" }}>
    <h1>Unable to resume presenter</h1><p role="alert">{error}</p>
    <a href="/builder">Back to Builder</a>
  </main>;
  return <main style={{ position: "fixed", inset: 0, background: "#e6efeb" }}>
    {accountError ? <div style={{ padding: 24 }}><p role="alert">{accountError}</p><p>Your presenter is kept open while access is checked.</p><button type="button" onClick={() => retryAccount.current()} style={{ minHeight: 44, padding: "8px 16px" }}>Retry account check</button> <a href="/builder">Back to Builder</a></div>
      : !html || checkingAccount ? <p role="status" style={{ padding: 24 }}>{checkingAccount ? "Checking your account…" : "Restoring presenter…"}</p> : null}
    {html ? <iframe ref={frame} title="Lesson presenter" srcDoc={html} onLoad={connectFrame} allowFullScreen
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, visibility: checkingAccount ? "hidden" : "visible" }} /> : null}
  </main>;
}
