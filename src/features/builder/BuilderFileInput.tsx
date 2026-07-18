"use client";

import { FilePlus2 } from "lucide-react";
import styles from "./BuilderShell.module.css";
import type { BuilderAsset } from "./schema";
import { fileToBuilderAsset } from "./starter";

type BuilderFileInputProps = {
  asset: BuilderAsset | null | undefined;
  label: string;
  onChange: (asset: BuilderAsset | null) => void;
  onError: (message: string) => void;
};

export function BuilderFileInput({
  asset,
  label,
  onChange,
  onError,
}: BuilderFileInputProps) {
  async function acceptFile(file: File | null | undefined) {
    if (!file) return;
    try {
      onChange(await fileToBuilderAsset(file));
    } catch {
      onError(`Could not read the ${label.toLowerCase()}.`);
    }
  }

  return (
    <div className={styles.assetEditor}>
      <span className={styles.assetLabel}>{label}</span>
      <label
        className={styles.imageDrop}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptFile(event.dataTransfer.files[0]);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.querySelector("input")?.click();
        }}
        tabIndex={0}
      >
        <span className={styles.imageDropMessage}>
          <FilePlus2 aria-hidden />
          <strong>{asset?.name || "Choose or drop file"}</strong>
          <small>
            {asset
              ? `${asset.type || "file"} · ${formatBytes(asset.size)}`
              : "Any file type is supported."}
          </small>
        </span>
        <input
          className="sr-only"
          type="file"
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

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
