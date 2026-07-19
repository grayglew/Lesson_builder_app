"use client";

import { ImagePlus } from "lucide-react";
import type { ClipboardEvent } from "react";
import styles from "./BuilderShell.module.css";
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

  function pastedImage(event: ClipboardEvent<HTMLLabelElement>) {
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
      <label
        className={`${styles.imageDrop} ${sizeClass}`}
        onMouseEnter={(event) => {
          event.currentTarget.focus({ preventScroll: true });
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptFile(event.dataTransfer.files[0]);
        }}
        onPaste={pastedImage}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.querySelector("input")?.click();
        }}
        tabIndex={0}
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
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          aria-label={label}
          onChange={(event) => {
            void acceptFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
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
  );
}
