"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { BuilderImageInput } from "./BuilderImageInput";
import styles from "./BuilderShell.module.css";
import { type CfuPlacement, createCfuSlide } from "./cfu";
import { type BuilderAsset, cfuSlideSchema } from "./schema";
import { SlideEditActions, SlideEditHeading, type SlideEditProps } from "./SlideEditForm";
import { useBuilderStore } from "./store";

export function CfuComposer({ editingSlide, onUpdate, onCancel }: SlideEditProps = {}) {
  const [existing] = useState(() => editingSlide ? cfuSlideSchema.safeParse(editingSlide).data : undefined);
  const addSlides = useBuilderStore((state) => state.addSlides);
  const updateSlideContent = useBuilderStore((state) => state.updateSlideContent);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [placement, setPlacement] = useState<CfuPlacement>(
    existing?.placement === "top-left" || existing?.placement === "top-center" ? existing.placement : "full",
  );
  const [image, setImage] = useState<BuilderAsset | null>(existing?.image ?? null);

  function addCfuSlide() {
    if (!image) {
      setStatus({ tone: "error", message: "Add a CFU image first." });
      return;
    }
    if (existing) {
      if (updateSlideContent(existing.id, { type: "cfu", image, placement })) onUpdate?.();
      return;
    }
    addSlides([createCfuSlide(image, placement)]);
    setStatus({
      tone: "success",
      message: "Added a legacy-compatible CFU slide after the selected slide.",
    });
  }

  return (
    <section className={styles.toolPanel} data-testid="cfu-panel">
      <div className={styles.panelHead}>
        {existing ? <SlideEditHeading>Edit CFU slide</SlideEditHeading> : <h3>Check for Understanding</h3>}
      </div>

      <label className={styles.fieldLabel} htmlFor="v2-cfu-placement">
        Placement
      </label>
      <select
        id="v2-cfu-placement"
        className={styles.textInput}
        value={placement}
        onChange={(event) =>
          setPlacement(event.target.value as CfuPlacement)
        }
      >
        <option value="full">Full slide</option>
        <option value="top-left">Top left</option>
        <option value="top-center">Top center</option>
      </select>

      <div className={styles.exampleMainColumn}>
        <BuilderImageInput
          asset={image}
          label="CFU image"
          size="tall"
          onChange={setImage}
          onError={(message) => setStatus({ tone: "error", message })}
        />
      </div>

      {existing ? <SlideEditActions onCancel={onCancel} onSave={addCfuSlide} /> : <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={addCfuSlide}
        >
          <Plus className="size-4" aria-hidden />
          Add CFU slide
        </button>
      </div>}
    </section>
  );
}
