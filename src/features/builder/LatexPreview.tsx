import styles from "./LatexComposer.module.css";
import { renderLatexDocument } from "./latex";

type LatexPreviewProps = {
  label: string;
  source: string;
};

export function LatexPreview({ label, source }: LatexPreviewProps) {
  const rendered = renderLatexDocument(source);

  return (
    <section className={styles.previewPanel} aria-label={label}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.previewSurface}>
        {rendered ? (
          <div
            className={styles.rendered}
            data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-content`}
            dangerouslySetInnerHTML={{ __html: rendered }}
          />
        ) : (
          <div className={styles.emptyState}>{label}</div>
        )}
      </div>
    </section>
  );
}
