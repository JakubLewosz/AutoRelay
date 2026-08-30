import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "sm" | "md";
    busy?: boolean;
  }
>;

const variants = {
  primary:
    "bg-emerald-400 text-slate-950 hover:bg-emerald-300 focus-visible:outline-emerald-300 disabled:bg-emerald-400/50",
  secondary:
    "border border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-sky-400",
  danger:
    "border border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:outline-rose-400",
  ghost: "text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-sky-400",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  busy = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-sm"
      } ${variants[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy}
      {...props}
    >
      {busy ? <span className="spinner size-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
