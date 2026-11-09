import { type BuilderDocument, type UnitOfWork, createBuilderId, createInitialBuilderDocument } from "./schema";
import { applyUnitToLesson } from "./unit-of-work";
import { emptyUnitResources } from "./unit-resources";

export type NewLessonUnitChoice = { mode: "none" } | { mode: "existing"; id: string } | { mode: "new"; name: string };
export type NewLessonDetails = { title: string; className: string; teachingDate: string; unit?: NewLessonUnitChoice };
type UnitSummary = Pick<UnitOfWork, "id" | "name">;
const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim();

export function newLessonUnitError(units: readonly UnitSummary[], choice: NewLessonUnitChoice): string | null {
  if (choice.mode === "existing") return units.some(unit => unit.id === choice.id) ? null : "The source unit is not available in your library.";
  if (choice.mode !== "new") return null;
  const name = normalizeName(choice.name);
  if (!name) return "Enter a name for the new unit.";
  if (name.length > 200) return "Unit names must be 200 characters or fewer.";
  return units.some(unit => normalizeName(unit.name).toLowerCase() === name.toLowerCase()) ? "A unit with that name already exists. Choose it from the list instead." : null;
}

/** Prepare locally: no store/library mutation until the lesson has saved. */
export function prepareNewLessonDocument(current: BuilderDocument, details: NewLessonDetails): BuilderDocument {
  const choice: NewLessonUnitChoice = details.unit || { mode: "none" };
  const error = newLessonUnitError(current.unitsOfWork, choice);
  if (error) throw new Error(error);
  const lessonTitle = normalizeName(details.title);
  const className = normalizeName(details.className);
  const [, month, day] = details.teachingDate.split("-");
  const next = {
    ...createInitialBuilderDocument(),
    title: `${className} ${lessonTitle} ${day}-${month}`,
    className,
    teachingDate: details.teachingDate,
    overallLessonLo: lessonTitle,
    classNames: [...current.classNames],
    retrievalItems: current.retrievalItems,
    slideTemplates: current.slideTemplates,
    unitsOfWork: current.unitsOfWork,
  };
  if (choice.mode === "none") return next;
  const unit: UnitOfWork = choice.mode === "existing"
    ? current.unitsOfWork.find(entry => entry.id === choice.id)!
    : { id: createBuilderId("unit"), name: normalizeName(choice.name), updatedAt: new Date().toISOString(),
      slides: [{ id: createBuilderId("resource"), title: "Unit resources", bullets: [], resources: emptyUnitResources() }] };
  if (choice.mode === "new") next.unitsOfWork = [...current.unitsOfWork, unit];
  return applyUnitToLesson(next, unit);
}
