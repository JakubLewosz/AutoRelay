import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { PropsWithChildren } from "react";

export function Alert({
  children,
  tone = "error",
}: PropsWithChildren<{ tone?: "error" | "success" | "info" }>) {
  const styles = {
    error: "border-rose-500/30 bg-rose-500/10 text-rose-100",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  };
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3.5 text-sm ${styles[tone]}`}
      role="alert"
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="leading-5">{children}</div>
    </div>
  );
}
