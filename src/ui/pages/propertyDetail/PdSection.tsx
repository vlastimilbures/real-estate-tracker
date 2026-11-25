import type { ReactNode } from "react";
import { sectionId, type PropertySection } from "../../model/sectionNav";

/** One of Property detail's sections: the section nav's target (ADR 0107). */
export function PdSection({
  section,
  children,
}: {
  section: PropertySection;
  children: ReactNode;
}) {
  return (
    <div className="pd-section" id={sectionId(section)}>
      {children}
    </div>
  );
}
