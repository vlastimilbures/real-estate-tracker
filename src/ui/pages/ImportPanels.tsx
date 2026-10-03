// Import page building blocks: one CSV file's panel (choose / drop / template, row
// errors) and the tables for parse errors and refused rows. Split from Import.tsx
// (DR-057); behaviour unchanged.
import { useState, useRef, useCallback } from "react";
import { Panel, Button, Badge, TableWrap } from "../components/primitives";
import type { CsvParseResult, CsvImportProblem } from "../../state/csv";
import { logFailure, messageOf } from "../../state/diagnostics";
import { saveFile } from "../../state/platform";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { fmtCzk } from "../../lib/format";
import type { CsvErrorCode, CsvRowError, ImportItem } from "../../state/csv";
import { changeText, groupByFile, itemLabel } from "../model/importPreview";

export interface FileState<T> {
  name: string;
  /** The file's raw bytes: the parser checks the encoding itself (D-49). */
  bytes: Uint8Array;
  result: CsvParseResult<T>;
}

function saveCsv(filename: string, content: string) {
  return saveFile({
    filename,
    data: content,
    mime: "text/csv",
    filter: { name: "CSV", extensions: ["csv"] },
  });
}

/** Render a pure-layer csv error code as a translated message. */
function csvErrorText(t: Dictionary, e: CsvErrorCode): string {
  const p = t.importPage;
  switch (e.code) {
    case "required":
      return p.errRequired;
    case "invalidDate":
      return p.errInvalidDate(e.value);
    case "invalidNumber":
      return p.errInvalidNumber(e.value);
    case "invalidInteger":
      return p.errInvalidInteger(e.value);
    case "invalidBoolean":
      return p.errInvalidBoolean(e.value);
    case "unknownProperty":
      return p.errUnknownProperty(e.value);
    case "instalmentRequired":
      return p.errInstalmentRequired;
    case "impossibleDate":
      return p.errImpossibleDate(e.value);
    case "decimalComma":
      return p.errDecimalComma(e.value);
    case "negativeAmount":
      return p.errNegativeAmount(e.value);
    case "rateOutOfRange":
      return p.errRateOutOfRange(e.value);
    case "notPositive":
      return p.errNotPositive(e.value);
    case "outOfRange": {
      const n = (v: number) => fmtCzk(v, { suffix: false });
      return p.errOutOfRange(e.value, n(e.min), n(e.max));
    }
    case "duplicateKey":
      return p.errDuplicateKey(e.firstRow);
    case "malformedRow":
      return p.errMalformedRow(e.expected, e.found);
    case "badQuotes":
      return p.errBadQuotes;
    case "notUtf8":
      return p.errNotUtf8;
    case "semicolonDelimiter":
      return p.errSemicolon;
    case "fileTooLarge":
      return p.errFileTooLarge(e.limitBytes / (1024 * 1024));
    case "tooManyRows":
      return p.errTooManyRows(e.limit);
  }
}

function ErrorTable({ errors }: { errors: CsvRowError[] }) {
  const t = useT();
  return (
    <TableWrap
      label={t.importPage.errorsBadge(errors.length)}
      style={{ marginTop: "var(--s3)" }}
    >
      <table className="data">
        <thead>
          <tr>
            <th>{t.importPage.colRow}</th>
            <th className="left">{t.importPage.colField}</th>
            <th className="left">{t.importPage.colError}</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={i}>
              <td>{e.row === 0 ? t.importPage.wholeFile : e.row}</td>
              <td className="left">{e.field ? <code>{e.field}</code> : "—"}</td>
              <td className="left" style={{ color: "var(--negative)" }}>
                {csvErrorText(t, e.error)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** Rows that refused an import, across files (nothing was written). */
export function RefusedTable({ problems }: { problems: CsvImportProblem[] }) {
  const t = useT();
  const p = t.importPage;
  return (
    <TableWrap label={p.importRefused} style={{ marginTop: "var(--s3)" }}>
      <p className="error-text">{p.importRefused}</p>
      <table className="data">
        <thead>
          <tr>
            <th className="left">{p.colFile}</th>
            <th>{p.colRow}</th>
            <th className="left">{p.colField}</th>
            <th className="left">{p.colError}</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((e, i) => (
            <tr key={i}>
              <td className="left">
                <code>{e.file}.csv</code>
              </td>
              <td>{e.row}</td>
              <td className="left">{e.field ? <code>{e.field}</code> : "—"}</td>
              <td className="left" style={{ color: "var(--negative)" }}>
                {e.problem.code === "unknownProperty"
                  ? p.errUnknownProperty(e.problem.value)
                  : t.inputRules[e.problem.rule]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function EntityImportPanel<T>({
  title,
  hint,
  templateFn,
  templateFile,
  fileState,
  onFile,
}: {
  title: string;
  hint: string;
  templateFn: () => string;
  templateFile: string;
  fileState: FileState<T> | null;
  onFile: (name: string, bytes: Uint8Array) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  async function saveTemplate() {
    setTemplateError(null);
    try {
      await saveCsv(templateFile, templateFn());
    } catch (e) {
      logFailure("TEMPLATE", e);
      setTemplateError(t.importPage.templateFailed(messageOf(e)));
    }
  }

  const acceptFile = useCallback(
    async (f: File) => {
      onFile(f.name, new Uint8Array(await f.arrayBuffer()));
    },
    [onFile],
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await acceptFile(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void acceptFile(f);
  }

  return (
    <Panel
      title={title}
      hint={hint}
      action={
        fileState ? (
          fileState.result.errors.length === 0 ? (
            <Badge band="good">
              {t.importPage.rowsReady(fileState.result.rows.length)}
            </Badge>
          ) : (
            <Badge band="bad">
              {t.importPage.errorsBadge(fileState.result.errors.length)}
            </Badge>
          )
        ) : undefined
      }
    >
      <div
        className={`dropzone${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="row" style={{ gap: "var(--s3)", flexWrap: "wrap" }}>
          <Button onClick={() => inputRef.current?.click()}>
            {fileState
              ? t.importPage.reupload(fileState.name)
              : t.importPage.chooseFile}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <Button variant="ghost" onClick={() => void saveTemplate()}>
            {t.importPage.downloadTemplate}
          </Button>
          {fileState && (
            <span
              className="num"
              style={{ color: "var(--ink-soft)", alignSelf: "center" }}
            >
              {fileState.name}
            </span>
          )}
        </div>
        <p className="dropzone-hint">{t.importPage.dropHint}</p>
        {templateError && <p className="error-text">{templateError}</p>}
      </div>
      {fileState && fileState.result.errors.length > 0 && (
        <ErrorTable errors={fileState.result.errors} />
      )}
    </Panel>
  );
}

/** What an import will do (preview) or did (report), per file (ADR 0096). In the report
 *  each record's name opens its property. */
export function ImportSummary({
  items,
  mode,
  onOpenProperty,
}: {
  items: ImportItem[];
  mode: "preview" | "report";
  onOpenProperty?: ((id: string) => void) | undefined;
}) {
  const t = useT();
  const p = t.importPage;
  const addLabel = mode === "preview" ? p.willAdd : p.added;
  const updateLabel = mode === "preview" ? p.willUpdate : p.updated;

  const name = (i: ImportItem) =>
    onOpenProperty ? (
      <button
        type="button"
        className="link-button"
        onClick={() => onOpenProperty(i.propertyId)}
      >
        {itemLabel(i)}
      </button>
    ) : (
      itemLabel(i)
    );

  return (
    <div className="import-summary">
      {groupByFile(t, items).map((g) => (
        <div key={g.file} className="import-summary-file">
          <strong>{g.title}</strong>
          <span className="counts">
            {[
              addLabel(g.added.length),
              updateLabel(g.updated.length),
              p.unchangedCount(g.unchanged),
            ].join(" · ")}
          </span>
          {g.added.length > 0 && (
            <details>
              <summary>{addLabel(g.added.length)}</summary>
              <ul>
                {g.added.map((i) => (
                  <li key={i.row}>{name(i)}</li>
                ))}
              </ul>
            </details>
          )}
          {g.updated.length > 0 && (
            <details open={mode === "preview"}>
              <summary>{updateLabel(g.updated.length)}</summary>
              <ul>
                {g.updated.map((i) => (
                  <li key={i.row}>
                    {name(i)}
                    <ul className="changes">
                      {i.changes.map((c) => (
                        <li key={c.field}>
                          <code>{c.field}</code> {changeText(c)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
