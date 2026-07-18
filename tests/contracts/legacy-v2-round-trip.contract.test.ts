import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const defaultContractPath = resolve("src/lib/builder-v2/contracts.ts");
const contractPath = process.env.BUILDER_V2_CONTRACT_MODULE
  ? resolve(process.env.BUILDER_V2_CONTRACT_MODULE)
  : defaultContractPath;
const contractIsAvailable = existsSync(contractPath);
const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/schema-v2/builder-state.json"), "utf8"),
) as Record<string, unknown>;

type BuilderContractModule = {
  parseBuilderDocument(input: unknown): unknown;
  serializeBuilderDocument(document: unknown): string;
};

describe.skipIf(!contractIsAvailable)("legacy/v2 round-trip contract", () => {
  it("loads a legacy schemaVersion 2 document and emits a legacy-readable document", async () => {
    const contracts = (await import(
      /* @vite-ignore */ pathToFileURL(contractPath).href
    )) as BuilderContractModule;

    expect(contracts.parseBuilderDocument).toBeTypeOf("function");
    expect(contracts.serializeBuilderDocument).toBeTypeOf("function");

    const parsed = contracts.parseBuilderDocument(fixture);
    const serializedText = contracts.serializeBuilderDocument(parsed);
    const serialized = JSON.parse(serializedText) as Record<string, unknown>;
    const reparsed = contracts.parseBuilderDocument(serialized);

    expect(serialized).toMatchObject({
      schemaVersion: 2,
      title: fixture.title,
      className: fixture.className,
      teachingDate: fixture.teachingDate,
    });
    expect(serialized.slides).toMatchObject(fixture.slides as object);
    expect(reparsed).toEqual(parsed);
  });

  it("does not introduce v2-only fields into the legacy wire document", async () => {
    const contracts = (await import(
      /* @vite-ignore */ pathToFileURL(contractPath).href
    )) as BuilderContractModule;
    const serialized = contracts.serializeBuilderDocument(
      contracts.parseBuilderDocument(fixture),
    );
    expect(serialized).not.toContain("__v2");
    expect(serialized).not.toContain("signedUrl");
  });
});
