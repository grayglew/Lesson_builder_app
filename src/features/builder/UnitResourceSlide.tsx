import { UNIT_RESOURCE_CSS, renderUnitResourceCards } from "./unit-resources";

export function UnitResourceSlide({ title, resources }: { title: string; resources: unknown }) {
  return <div className="unit-resource-surface">
    <style>{UNIT_RESOURCE_CSS}</style>
    <div style={{ height: "100%" }} dangerouslySetInnerHTML={{ __html: renderUnitResourceCards(title, resources) }} />
  </div>;
}
