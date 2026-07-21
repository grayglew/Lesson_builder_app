import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

vi.mock("@/app/login/actions", () => ({
  signIn: vi.fn(),
}));

afterEach(cleanup);

describe("LoginPage builder routing", () => {
  it("uses the access-controlled builder entry for a normal login", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelector('input[name="next"]')).toHaveValue("/");
  });

  it("preserves an explicit direct legacy-builder return path", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ next: "/builder/index.html" }),
      }),
    );

    expect(document.querySelector('input[name="next"]')).toHaveValue(
      "/builder/index.html",
    );
  });
});
