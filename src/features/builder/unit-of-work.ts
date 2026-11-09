import { type BuilderDocument, type BuilderSlide, type UnitOfWork, createBuilderId } from "./schema";

/** Materialize resource snapshots without resolving a remote/live dependency. */
export function applyUnitToLesson(document: BuilderDocument, unit: UnitOfWork | null): BuilderDocument {
  const previous = document.slides.filter(slide =>
    Boolean(document.unitOfWorkId) && slide.unitOfWorkId === document.unitOfWorkId,
  );
  const firstIndex = document.slides.findIndex(slide => previous.includes(slide));
  const ordinary = document.slides.filter(slide => !previous.includes(slide));
  const resources: BuilderSlide[] = (unit?.slides || []).map(resource => ({
    id: previous.find(slide => slide.unitResourceId === resource.id && slide.unitOfWorkId === unit?.id)?.id || createBuilderId("slide"),
    type: "template",
    title: resource.title,
    bullets: [...resource.bullets],
    ...(resource.resources ? { resources: { ...resource.resources } } : {}),
    unitOfWorkId: unit!.id,
    unitResourceId: resource.id,
    createdAt: new Date().toISOString(),
  }));
  ordinary.splice(firstIndex < 0 ? ordinary.length : firstIndex, 0, ...resources);
  const handoutIds = new Set(document.handoutSlideIds);
  return {
    ...document,
    unitOfWorkId: unit?.id || "",
    unitOfWorkName: unit?.name || "",
    unitOfWorkVersion: unit?.updatedAt || "",
    slides: ordinary,
    handoutSlideIds: ordinary.filter(slide => handoutIds.has(slide.id)).map(slide => slide.id),
  };
}
