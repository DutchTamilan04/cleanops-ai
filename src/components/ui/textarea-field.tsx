import { useId, type TextareaHTMLAttributes } from "react";

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  help?: string;
};

export function TextAreaField({ label, help, id, className, ...props }: TextAreaFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label className="ui-field" htmlFor={inputId}>
      <span className="ui-field-label">{label}</span>
      <textarea
        id={inputId}
        className={["ui-field-input", "ui-field-textarea", className].filter(Boolean).join(" ")}
        aria-describedby={help ? `${inputId}-help` : undefined}
        {...props}
      />
      {help ? (
        <span className="ui-field-help" id={`${inputId}-help`}>
          {help}
        </span>
      ) : null}
    </label>
  );
}
