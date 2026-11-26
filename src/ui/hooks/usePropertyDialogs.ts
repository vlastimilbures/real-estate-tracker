// The Properties page's dialogs: Add, Edit, and the delete confirm with its delete.
import { useEffect, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";

export function usePropertyDialogs() {
  const removeProperty = usePortfolioStore((s) => s.removeProperty);
  const [adding, setAdding] = useState(false);
  const newPropertyRequested = useUiStore((s) => s.newPropertyRequested);
  const clearNewPropertyRequest = useUiStore((s) => s.clearNewPropertyRequest);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // File ▸ New Property… (⌘N) lands here with a one-shot request: open the form
  // during render, then clear the request in the store.
  if (newPropertyRequested && !adding) setAdding(true);
  useEffect(() => {
    if (newPropertyRequested) clearNewPropertyRequest();
  }, [newPropertyRequested, clearNewPropertyRequest]);

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
