// Field controls — a labelled Field and the inputs that read its context (fieldContext).
import { useId, type ReactNode } from "react";
import { FieldContext, useFieldControlProps } from "./fieldContext";

export function Field({
  id: idProp,
  label,
  error,
  help,
  required = false,
  invalid = false,
  children,
}: {
  /** The control's id, when something else must focus it (an error summary link). */
  id?: string | undefined;
  label: string;
  error?: string | undefined;
  help?: string | undefined;
  /** Marks the label "*" and the control aria-required (UX-040). */
  required?: boolean | undefined;
  /** Marks the control invalid without an error of its own, e.g. a whole row (ADR 0189). */
  invalid?: boolean | undefined;
  children: ReactNode;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const noteId = `${id}-note`;
  const note = error ?? help;
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      {/* The "*" is CSS generated content with empty alt text: seen, not read
          (the control is aria-required instead) (UX-040). */}
      <label htmlFor={id} className={required ? "required" : undefined}>
        {label}
      </label>
      <FieldContext.Provider
        value={{
          id,
          invalid: invalid || Boolean(error),
          required,
          describedBy: note ? noteId : undefined,
        }}
      >
        {children}
      </FieldContext.Provider>
      {error ? (
        <span className="err" id={noteId}>
          {error}
        </span>
      ) : help ? (
        <span className="help" id={noteId}>
          {help}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  suffix,
  placeholder,
  inputMode = "text",
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string | undefined;
  placeholder?: string | undefined;
  inputMode?: "text" | "decimal" | "numeric" | undefined;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const fieldProps = useFieldControlProps();
  return (
    <div className="input-wrap">
      <input
        {...fieldProps}
        className={suffix ? "has-suffix" : ""}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const fieldProps = useFieldControlProps();
  return (
    <select
      {...fieldProps}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const fieldProps = useFieldControlProps();
  return <textarea {...fieldProps} {...props} />;
}

/** A checkbox inside a Field: the Field label and its own wrapping label both name it. */
export function Checkbox(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const fieldProps = useFieldControlProps();
  return <input type="checkbox" {...fieldProps} {...props} />;
}
