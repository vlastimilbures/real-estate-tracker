import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import { Modal } from "./Modal";
import { Button } from "./primitives";

/**
 * Asks before a navigation drops unsaved form edits (UX-030). The store holds the
 * navigation back while `unsavedChanges` is set; Discard carries it out, Keep editing
 * (also ✕, Esc and the backdrop) stays.
 */
export function LeaveGuard() {
  const t = useT();
  const pending = useUiStore((s) => s.pendingLeave);
  const confirmLeave = useUiStore((s) => s.confirmLeave);
  const cancelLeave = useUiStore((s) => s.cancelLeave);
  if (!pending) return null;
  return (
    <Modal
      titleId="leave-guard-title"
      title={t.common.unsavedTitle}
      onClose={cancelLeave}
      closeLabel={t.common.close}
      footer={
        <>
          <Button onClick={cancelLeave}>{t.common.keepEditing}</Button>
          <Button variant="danger" onClick={confirmLeave}>
            {t.common.discardChanges}
          </Button>
        </>
      }
    >
      <p>{t.common.unsavedBody}</p>
    </Modal>
  );
}
