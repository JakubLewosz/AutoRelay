import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type SharedProps = {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/15 disabled:cursor-not-allowed disabled:opacity-60";

function FieldLabel({ label, optional }: Pick<SharedProps, "label" | "optional">) {
  return (
    <span className="text-sm font-medium text-slate-200">
      {label}
      {optional ? <span className="ml-2 font-normal text-slate-500">Optional</span> : null}
    </span>
  );
}

function FieldHelp({ hint, error }: Pick<SharedProps, "hint" | "error">) {
  if (error) return <span className="mt-1.5 block text-xs text-rose-300">{error}</span>;
  return hint ? (
    <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span>
  ) : null;
}

export const Input = forwardRef<
  HTMLInputElement,
  SharedProps & InputHTMLAttributes<HTMLInputElement>
>(function Input({ label, hint, error, optional, id, className = "", ...props }, ref) {
  const fieldId = id ?? props.name;
  return (
    <label htmlFor={fieldId} className="block">
      <FieldLabel label={label} optional={optional} />
      <input
        ref={ref}
        id={fieldId}
        className={`${fieldClass} ${error ? "border-rose-500/70" : ""} ${className}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
      <FieldHelp hint={hint} error={error} />
    </label>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  SharedProps & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ label, hint, error, optional, id, className = "", ...props }, ref) {
  const fieldId = id ?? props.name;
  return (
    <label htmlFor={fieldId} className="block">
      <FieldLabel label={label} optional={optional} />
      <textarea
        ref={ref}
        id={fieldId}
        className={`${fieldClass} min-h-28 resize-y ${error ? "border-rose-500/70" : ""} ${className}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
      <FieldHelp hint={hint} error={error} />
    </label>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SharedProps & SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ label, hint, error, optional, id, className = "", children, ...props }, ref) {
  const fieldId = id ?? props.name;
  return (
    <label htmlFor={fieldId} className="block">
      <FieldLabel label={label} optional={optional} />
      <select
        ref={ref}
        id={fieldId}
        className={`${fieldClass} ${error ? "border-rose-500/70" : ""} ${className}`}
        aria-invalid={Boolean(error)}
        {...props}
      >
        {children}
      </select>
      <FieldHelp hint={hint} error={error} />
    </label>
  );
});
