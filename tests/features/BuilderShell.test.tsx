import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuilderShell } from "@/features/builder/BuilderShell";
import { loadBuilderDocument } from "@/features/builder/api-client";
import {
  loadV2CachedDocument,
  saveV2CachedDocument,
} from "@/features/builder/persistence";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";

vi.mock("@/features/builder/persistence", () => ({
  loadV2CachedDocument: vi.fn().mockResolvedValue(null),
  saveV2CachedDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/builder/api-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/builder/api-client")>();
  return {
    ...original,
    loadBuilderDocument: vi.fn().mockResolvedValue(null),
    syncBuilderDocument: vi.fn().mockResolvedValue(undefined),
  };
});

describe("BuilderShell legacy UI parity", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(loadBuilderDocument).mockResolvedValue(null);
    vi.mocked(loadV2CachedDocument).mockResolvedValue(null);
    vi.mocked(saveV2CachedDocument).mockResolvedValue(undefined);
    useBuilderStore
      .getState()
      .hydrate(createInitialBuilderDocument("2026-07-18T06:00:00.000Z"));
  });

  it("uses the original three-region workflow and tool order", async () => {
    render(<BuilderShell accessMode="admin" userEmail="teacher@example.com" />);

    expect(
      await screen.findByRole("complementary", {
        name: "Lesson builder navigation",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Starter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Lesson preview" }),
    ).toBeInTheDocument();

    expect(
      screen
        .getByRole("navigation", { name: "Slide tools" })
        .querySelectorAll("button"),
    ).toHaveLength(11);
    expect(screen.getByLabelText("Lesson title")).toBeInTheDocument();
    expect(screen.getByLabelText("Class")).toBeInTheDocument();
    expect(screen.getByLabelText("Date of teaching")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson" })).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Migration pending"),
    ).not.toBeInTheDocument();
    const preview = screen.getByRole("complementary", {
      name: "Lesson preview",
    });
    expect(
      screen.getByRole("button", { name: "Preview full lesson" }),
    ).toBeEnabled();
    expect(
      screen.getByText("Import or export lesson"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Export full backup")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("complementary", { name: "Lesson builder navigation" })
        .querySelector("input[accept*='json']"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "0 slides" }),
    ).toBeInTheDocument();

    await userEvent.setup().click(
      screen.getByText("Import or export lesson").closest("summary")!,
    );
    expect(preview).toHaveTextContent("Export HTML");
    expect(preview).toHaveTextContent("Export PDF");
    expect(preview).toHaveTextContent("Export JSON");
    expect(preview).toHaveTextContent("Import HTML");
    expect(preview).toHaveTextContent("Import JSON");
    expect(preview).not.toHaveTextContent("Export full backup");
  });

  it("keeps placeholder authoring in the central tool panel", async () => {
    const user = userEvent.setup();
    render(<BuilderShell accessMode="admin" userEmail="teacher@example.com" />);

    await user.click(screen.getByRole("button", { name: "Placeholder" }));
    await user.clear(screen.getByLabelText("Placeholder text"));
    await user.type(screen.getByLabelText("Placeholder text"), "Worked example");
    await user.click(
      screen.getByRole("button", { name: "Add placeholder slide" }),
    );

    expect(useBuilderStore.getState().document.slides).toEqual([
      expect.objectContaining({
        type: "placeholder",
        text: "Worked example",
      }),
    ]);
    expect(
      screen.getByRole("heading", { name: "1 slide" }),
    ).toBeInTheDocument();
  });
});
