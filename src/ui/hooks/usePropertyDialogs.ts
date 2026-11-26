// The Properties page's dialogs: Add, Edit, and the delete confirm with its delete.
import { useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { usePageRequest, useUnhandled } from "./usePageRequest";

export function usePropertyDialogs() {
  const removeProperty = usePortfolioStore((s) => s.removeProperty);
  const [addingByHand, setAddingByHand] = useState(false);
  // File ▸ New Property… (⌘N) lands here with a request: the Add form shows until it
  // is closed, and a new ⌘N is a new request (ADR 0269).
  const asked = useUnhandled(usePageRequest("properties")?.id ?? null);
  const adding = addingByHand || asked.waiting;
  const setAdding = (open: boolean) => {
    setAddingByHand(open);
    if (!open) asked.handled();
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    const result = await removeProperty(id);
    // On failure the confirm row stays open and says why. Row actions are disabled while
    // the delete runs, so this is still its confirm (ADR 0253).
    if (result.ok) setDeletingId(null);
    return result;
  }

  return {
    adding,
    setAdding,
    editingId,
    setEditingId,
    deletingId,
    setDeletingId,
    handleDelete,
  };
}
