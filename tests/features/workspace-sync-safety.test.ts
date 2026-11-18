import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialBuilderDocument } from "@/features/builder/schema";

const oldTime = "2026-11-01T00:00:00.000Z";
const newTime = "2026-11-17T00:00:00.000Z";

describe("workspace revision authority", () => {
  let revision: string;
  let completedBodies: Record<string, unknown>[];
  let requestedTickets: number;

  beforeEach(() => {
    vi.resetModules();
    revision = "workspace:original";
    completedBodies = [];
    requestedTickets = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      let value: unknown;
      if (url.includes("/latest?")) value = {
        exists: true, revision, updatedAt: oldTime,
        signedUrl: "https://storage.example/workspace",
      };
      else if (url.endsWith("/bootstrap")) value = {
        ok: true, state: { updatedAt: newTime, classNames: ["11Ma2"], retrievalItems: [], slideTemplates: [] },
      };
      else if (url === "https://storage.example/workspace") value = createInitialBuilderDocument(oldTime);
      else if (url.endsWith("/upload-url")) {
        requestedTickets++;
        value = { ok: true, kind: "workspace", path: "fixture/snapshot.json", signedUrl: "https://storage.example/upload" };
      } else if (url === "https://storage.example/upload") value = {};
      else if (url.endsWith("/complete")) {
        const body = JSON.parse(String(init?.body));
        completedBodies.push(body);
        if (body.expectedRevision !== revision) return Response.json({ ok: false, error: "Workspace conflict" }, { status: 409 });
        revision = `workspace:saved-${completedBodies.length}`;
        value = { ok: true, kind: "workspace", revision, updatedAt: body.updatedAt };
      } else throw new Error(`Unexpected test request: ${url}`);
      return Response.json(value);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("does not let a fresh global read change the age of the saved workspace", async () => {
    const api = await import("@/features/builder/api-client");
    const document = await api.loadBuilderDocument();
    expect(document?.updatedAt).toBe(oldTime);
    expect(document?.classNames).toContain("11Ma2");
  });

  it("rejects the first stale-tab write even if it claims the current head", async () => {
    const api = await import("@/features/builder/api-client");
    const document = (await api.loadBuilderDocument())!;
    revision = "workspace:other-tab-with-11.05";
    const currentHead = await api.getWorkspaceSyncHead();
    await expect(api.syncBuilderDocument(document, { expectedRevision: currentHead.revision }))
      .rejects.toMatchObject({ status: 409 });
    expect(requestedTickets).toBe(0);
    expect(completedBodies).toHaveLength(0);
  });

  it("guards explicit saves as well as autosaves against another tab", async () => {
    const api = await import("@/features/builder/api-client");
    const document = (await api.loadBuilderDocument())!;
    revision = "workspace:other-tab-with-11.05";
    await expect(api.syncBuilderDocument(document)).rejects.toMatchObject({ status: 409 });
    expect(completedBodies).toHaveLength(0);
  });

  it("does not upload without a successfully loaded revision", async () => {
    const api = await import("@/features/builder/api-client");
    await expect(api.syncBuilderDocument(createInitialBuilderDocument())).rejects.toThrow(/cloud workspace/i);
    expect(requestedTickets).toBe(0);
  });

  it("uses its own confirmed revision for the next serialized explicit save", async () => {
    const api = await import("@/features/builder/api-client");
    const document = (await api.loadBuilderDocument())!;
    await Promise.all([api.syncBuilderDocument(document), api.syncBuilderDocument({ ...document, updatedAt: newTime })]);
    expect(completedBodies.map(body => body.expectedRevision)).toEqual(["workspace:original", "workspace:saved-1"]);
  });

  it("does not grant a canceled load authority over the accepted workspace", async () => {
    const api = await import("@/features/builder/api-client");
    const controller = new AbortController();
    let finishOld!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const superseded = api.loadBuilderDocument(controller.signal);
    const activeDocument = (await api.loadBuilderDocument())!;
    controller.abort();
    revision = "workspace:other-tab-with-11.05";
    finishOld(Response.json({ exists: true, revision, signedUrl: "https://storage.example/workspace", updatedAt: newTime }));
    await expect(superseded).rejects.toMatchObject({ name: "AbortError" });
    await expect(api.syncBuilderDocument(activeDocument)).rejects.toMatchObject({ status: 409 });
    expect(requestedTickets).toBe(0);
  });
});
