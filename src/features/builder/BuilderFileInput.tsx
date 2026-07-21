"use client";

import { FilePlus2 } from "lucide-react";
import { useRef } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

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
      <button
        className={styles.imageDrop}
        type="button"
        aria-label={`Choose ${label}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptFile(event.dataTransfer.files[0]);
        }}
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
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        aria-label={label}
        tabIndex={-1}
        onChange={(event) => {
          void acceptFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
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
