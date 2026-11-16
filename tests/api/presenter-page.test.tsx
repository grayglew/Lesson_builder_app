import { expect, it, vi } from "vitest";
import PresenterPage from "@/app/builder/presenter/[sessionId]/page";
import { getAuthorizedAppContext, resolveEffectiveUser } from "@/lib/auth/app-users";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (url: string) => { throw new Error(url); } }));
vi.mock("@/lib/auth/app-users", () => ({ getAuthorizedAppContext: vi.fn(), resolveEffectiveUser: vi.fn() }));
const id = "e4b62fc5-f355-4bdd-991d-9feef1ea1946";
it("rejects invalid session paths", async () => {
  await expect(PresenterPage({ params: Promise.resolve({ sessionId: "invalid" }) })).rejects.toThrow("NOT_FOUND");
});
it("requires authenticated active-teacher access before restoring local content", async () => {
  vi.mocked(getAuthorizedAppContext).mockResolvedValue({ response: new Response(null, { status: 401 }) } as never);
  await expect(PresenterPage({ params: Promise.resolve({ sessionId: id }) })).rejects.toThrow(`/login?next=${encodeURIComponent(`/builder/presenter/${id}`)}`);
});
it("scopes recovery to both the actor and effective teacher", async () => {
  vi.mocked(getAuthorizedAppContext).mockResolvedValue({ actorUser: { id: "admin" } } as never);
  vi.mocked(resolveEffectiveUser).mockResolvedValue({ effectiveUser: { id: "teacher" } } as never);
  const page = await PresenterPage({ params: Promise.resolve({ sessionId: id }) });
  expect(page.props).toEqual({ owner: "admin:teacher", sessionId: id });
});
