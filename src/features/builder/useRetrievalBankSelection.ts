"use client";

import { useState } from "react";
import { getLinkedBank } from "./retrieval-bank-links";
import type { BuilderDocument } from "./schema";
import { useBuilderStore } from "./store";

export function useRetrievalBankSelection(document: BuilderDocument) {
  const lessonSession = useBuilderStore(state => state.lessonSession);
  const partner = getLinkedBank(document.linkedRetrievalBanks, document.className);
  const context = JSON.stringify([lessonSession, document.className, partner]);
  const [choice, setChoice] = useState({ context, bank: document.className });
  if (choice.context !== context) setChoice({ context, bank: document.className });
  return {
    partner,
    bank: choice.context === context && choice.bank === partner ? partner : document.className,
    chooseBank: (bank: string) => setChoice({ context, bank }),
  };
}
