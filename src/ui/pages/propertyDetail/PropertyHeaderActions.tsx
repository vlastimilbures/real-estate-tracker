import { Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "../../components/Button";
import { useT } from "../../hooks/useT";

/** The top bar's Edit property, and Deactivate or Activate. Below a 1100 px window only
 *  the icon shows; the label stays the button's name (ADR 0215 §2). */
export function PropertyHeaderActions({
  isActive,
  toggling,
  onEdit,
  onDeactivate,
  onActivate,
}: {
  isActive: boolean;
  /** Activate is running. */
  toggling: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) {
  const t = useT();
  const d = t.propertyDetail;
  return (
    <>
      <Button variant="primary" icon={Pencil} onClick={onEdit}>
        {t.properties.editProperty}
      </Button>
      {isActive ? (
        <Button
          icon={PowerOff}
          onClick={onDeactivate}
          title={d.deactivateTitle}
        >
          <span className="narrow-hide">{d.deactivate}</span>
        </Button>
      ) : (
        <Button
          icon={Power}
          disabled={toggling}
          onClick={onActivate}
          title={d.activateTitle}
        >
          <span className="narrow-hide">
            {toggling ? d.activating : d.activate}
          </span>
        </Button>
      )}
    </>
  );
}
