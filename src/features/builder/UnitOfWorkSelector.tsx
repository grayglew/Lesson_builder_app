"use client";

import { useState } from "react";
import { useAppNotifications } from "./AppNotifications";
import { useBuilderStore } from "./store";
import styles from "./UnitOfWorkEditor.module.css";

export function useUnitAssociation() {
  const currentUnitId = useBuilderStore(state => state.document.unitOfWorkId);
  const associate = useBuilderStore(state => state.associateUnitOfWork);
  const refresh = useBuilderStore(state => state.refreshUnitOfWork);
  const { confirmDialog } = useAppNotifications();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(id: string, refreshing = false) {
    if (busy || (!refreshing && id === currentUnitId)) return false;
    setBusy(true);
    try {
      if ((refreshing || currentUnitId) && !await confirmDialog({
        title: refreshing ? "Update unit resource slides?" : "Change the lesson unit?",
        description: "This replaces this lesson’s linked unit slides, including local edits and annotations on those slides. Other lesson slides and detached copies are kept.",
        confirmLabel: refreshing ? "Update unit slides" : "Change unit", tone: "warning",
      })) return false;
      if (refreshing) refresh(); else associate(id);
      setError("");
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update the unit slides.");
      return false;
    } finally { setBusy(false); }
  }

  return { currentUnitId, update, busy, error };
}

export function UnitOfWorkSelector() {
  const document = useBuilderStore(state => state.document);
  const { update, busy, error } = useUnitAssociation();
  const source = document.unitsOfWork.find(unit => unit.id === document.unitOfWorkId);

  return (
    <div className={styles.selector}>
      <label className={styles.field} htmlFor="v2-unit-of-work">Unit of work</label>
        <select id="v2-unit-of-work" aria-label="Unit of work" className={styles.unitSelect} value={document.unitOfWorkId} disabled={busy} onChange={event => void update(event.target.value)}>
          <option value="">No unit</option>
          {document.unitOfWorkId && !source ? <option value={document.unitOfWorkId}>{document.unitOfWorkName || "Saved unit"} (source unavailable)</option> : null}
          {document.unitsOfWork.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      {document.unitsOfWork.length ? <p className={styles.note}>Choosing a unit adds its resource slides to this deck.</p> : null}
      {source && source.updatedAt !== document.unitOfWorkVersion ? (
        <button type="button" disabled={busy} onClick={() => void update(source.id, true)}>Update unit slides</button>
      ) : null}
      {!document.unitsOfWork.length ? <p className={styles.note}>Create reusable slides in Library → Units of work.</p> : null}
      {document.unitOfWorkId && !source ? <p className={styles.note}>The source unit is not in this workspace. Your saved resource slides are still available.</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div>
  );
}
