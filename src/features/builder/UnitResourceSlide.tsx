import { UNIT_RESOURCE_CSS, renderUnitResourceCards } from "./unit-resources";

export function UnitResourceSlide({ title, resources, thumbnail = false }: { title: string; resources: unknown; thumbnail?: boolean }) {
  return <div className={`unit-resource-surface${thumbnail ? " unit-resource-thumbnail" : ""}`}>
    <style>{UNIT_RESOURCE_CSS}</style>
    <div style={{ height: "100%" }} dangerouslySetInnerHTML={{ __html: renderUnitResourceCards(title, resources, !thumbnail) }} />
  </div>;
}
