import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixtureDirectory = resolve("tests/fixtures/schema-v2");

function readFixture(name: string) {
  return JSON.parse(readFileSync(resolve(fixtureDirectory, name), "utf8")) as Record<string, unknown>;
}

describe("schemaVersion 2 compatibility fixtures", () => {
  it.each(["builder-state.json", "lesson-export.json", "global-state.json"])(
    "keeps %s deterministic and at schemaVersion 2",
    (name) => {
      const fixture = readFixture(name);
      expect(fixture.schemaVersion).toBe(2);
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
      expect(JSON.stringify(fixture)).not.toContain("data:image/");
      expect(JSON.stringify(fixture)).not.toContain("signedUrl");
    },
  );

  it("represents a complete editable legacy state", () => {
    const fixture = readFixture("builder-state.json");
    expect(fixture).toMatchObject({
      title: "Synthetic algebra lesson",
      className: "Year 9",
      teachingDate: "2026-07-15",
    });
    expect(fixture.slides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "starter" }),
        expect.objectContaining({ type: "example" }),
        expect.objectContaining({ type: "template" }),
      ]),
    );
    expect(fixture.retrievalItems).toEqual([
      expect.objectContaining({
        loCode: "9a1",
        currentImageSlot: 2,
        selected: false,
      }),
    ]);
  });

  it("marks lesson-only exports so the legacy builder preserves its retrieval bank", () => {
    const fixture = readFixture("lesson-export.json");
    expect(fixture).toMatchObject({
      exportScope: "lesson-only",
      retrievalBankOmitted: true,
      retrievalItems: [],
    });
  });
});
