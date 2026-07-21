"use client";

import { ImagePlus, Pencil } from "lucide-react";
import { type ClipboardEvent, useRef, useState } from "react";
import localStyles from "./BuilderImageInput.module.css";
import styles from "./BuilderShell.module.css";
import { ImageDrawingEditor } from "./ImageDrawingEditor";
import type { BuilderAsset } from "./schema";
import { fileToBuilderAsset } from "./starter";

type BuilderImageInputProps = {
  asset: BuilderAsset | null | undefined;
  label: string;
  onChange: (asset: BuilderAsset | null, file?: File) => void;
  onError: (message: string) => void;
  size?: "default" | "tall" | "retrieval";
};

export function BuilderImageInput({
  asset,
  label,
  onChange,
  onError,
  size = "default",
}: BuilderImageInputProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function acceptFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError(`${label} must be an image file.`);
      return;
    }
    try {
      onChange(await fileToBuilderAsset(file), file);
    } catch {
      onError(`Could not read the ${label.toLowerCase()}.`);
    }
  }

  function pastedImage(event: ClipboardEvent<HTMLButtonElement>) {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void acceptFile(file);
  }

  const sizeClass =
    size === "tall"
      ? styles.imageDropTall
      : size === "retrieval"
        ? styles.imageDropRetrieval
        : "";

  return (
    <div className={styles.assetEditor}>
      <span className={styles.assetLabel}>{label}</span>
      <button
        className={`${styles.imageDrop} ${sizeClass}`}
        type="button"
        aria-label={`Choose or paste ${label}`}
        onClick={() => inputRef.current?.click()}
        onMouseEnter={(event) => {
          event.currentTarget.focus({ preventScroll: true });
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptFile(event.dataTransfer.files[0]);
        }}
        onPaste={pastedImage}
      >
        {asset?.dataUrl ? (
          // Embedded lesson images and signed URLs do not have stable dimensions.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${label} preview`}
            className={styles.imageDropPreview}
            src={asset.dataUrl}
          />
        ) : (
          <span className={styles.imageDropMessage}>
            <ImagePlus aria-hidden />
            <strong>Paste or drop image</strong>
            <small>Hover here and paste, or click to choose an image.</small>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        aria-label={label}
        tabIndex={-1}
        onChange={(event) => {
          void acceptFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className={localStyles.actions}>
        <button
          className={localStyles.drawButton}
          type="button"
          aria-label={`Draw ${label}`}
          onClick={() => setIsDrawing(true)}
        >
          <Pencil size={14} aria-hidden />
          {asset ? "Draw over image" : "Draw image"}
        </button>
        {asset ? (
          <button
            className={styles.removeAssetButton}
            type="button"
            onClick={() => onChange(null)}
          >
            Remove {label.toLowerCase()}
          </button>
        ) : null}
      </div>
      {isDrawing ? (
        <ImageDrawingEditor
          asset={asset}
          label={label}
          onDone={(drawnAsset, file) => {
            onChange(drawnAsset, file);
            setIsDrawing(false);
          }}
          onCancel={() => setIsDrawing(false)}
          onError={onError}
        />
      ) : null}
    </div>
  );
}
