import { PageFrame } from "../components/PageFrame";
import { Panel } from "../components/primitives";
import {
  propertiesTemplate,
  valuationsTemplate,
  rentsTemplate,
  mortgagesTemplate,
} from "../../state/csv";
import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import type { BusyFocusTarget } from "../hooks/useBusyFocus";
import { useImportSession } from "../hooks/useImportSession";
import { FILE_KINDS, type FileKind } from "../model/importSession";
import type { Dictionary } from "../../i18n";
import {
  IMPORT_BUTTON,
  ImportFilesPanel,
  ImportSummary,
  type ImportFileType,
} from "./ImportPanels";
import { ImportRunPanel } from "./ImportRunPanel";

const REPORT_HEADING = "import-report-title";

/** Where focus goes once an import ends (ADR 0248 §2–§3). A success clears the files and
 *  with them the Import panel: the report heading. Otherwise Import, also after the
 *  overwrite confirm that left; the panel heading when a refused plan disabled Import. */
const afterImport: BusyFocusTarget = (_trigger, panel) => {
  if (!panel?.isConnected) return document.getElementById(REPORT_HEADING);
  const run = document.getElementById(IMPORT_BUTTON);
  return run && !run.matches(":disabled") ? run : panel.querySelector("h2");
};

/** Each type's title, expected file name and template (ADR 0212). */
const TYPES: Record<
  FileKind,
  { title: (t: Dictionary) => string; templateFn: () => string }
> = {
  properties: {
    title: (t) => t.importPage.propertiesTitle,
    templateFn: propertiesTemplate,
  },
  valuations: {
    title: (t) => t.importPage.valuationsTitle,
    templateFn: valuationsTemplate,
  },
  rents: { title: (t) => t.importPage.rentsTitle, templateFn: rentsTemplate },
  mortgages: {
    title: (t) => t.importPage.mortgagesTitle,
    templateFn: mortgagesTemplate,
  },
};

export function Import() {
  const t = useT();
  const lastImport = useUiStore((s) => s.lastImport);
  const openProperty = useUiStore((s) => s.openProperty);
  const session = useImportSession(afterImport);
  const files: ImportFileType[] = FILE_KINDS.map((kind) => ({
    key: kind,
    title: TYPES[kind].title(t),
    file: `${kind}.csv`,
    templateFn: TYPES[kind].templateFn,
    fileState: session.files[kind] ?? null,
    onFile: (name, bytes) => session.chooseFile(kind, name, bytes),
  }));

  return (
    <PageFrame
      title={t.importPage.title}
      subtitle={t.importPage.subtitle}
      showLens={false}
    >
      <ImportFilesPanel files={files} />

      {session.view.phase !== "noFile" && (
        <ImportRunPanel
          view={session.view}
          importing={session.importing}
          onRun={(confirmed) => void session.runImport(confirmed)}
          onCancel={session.cancelConfirm}
        />
      )}

      {lastImport && (
        <Panel title={t.importPage.reportTitle} headingId={REPORT_HEADING}>
          <ImportSummary
            items={lastImport.items}
            mode="report"
            onOpenProperty={openProperty}
          />
        </Panel>
      )}
    </PageFrame>
  );
}
