import { hydrateLiveRetrievalAssets } from "./live-retrieval-assets";
import {
  embedRemoteBuilderAssets,
  type EmbedRemoteBuilderAssetsOptions,
} from "./lesson-export";
import type { BuilderDocument, RetrievalItem } from "./schema";

type HydrateBuilderDocument = (
  document: BuilderDocument,
  retrievalItems?: readonly RetrievalItem[],
) => Promise<BuilderDocument>;

type EmbedBuilderDocument = (
  document: BuilderDocument,
  options?: EmbedRemoteBuilderAssetsOptions,
) => Promise<BuilderDocument>;

export type ExportPreparationDependencies = {
  hydrate?: HydrateBuilderDocument;
  embed?: EmbedBuilderDocument;
};

export async function prepareBuilderDocumentForExport(
  document: BuilderDocument,
  retrievalItems: readonly RetrievalItem[] = document.retrievalItems,
  dependencies: ExportPreparationDependencies = {},
): Promise<BuilderDocument> {
  const hydrate = dependencies.hydrate ?? hydrateLiveRetrievalAssets;
  const embed = dependencies.embed ?? embedRemoteBuilderAssets;
  const hydrated = await hydrate(document, retrievalItems);
  return embed(hydrated, {
    managedAssetFailure: "throw",
    traversalScope: "slides",
  });
}
