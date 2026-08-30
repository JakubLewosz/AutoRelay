import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-700 bg-slate-950/70">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 text-xs leading-5 text-slate-300">
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 rounded-none border-l border-slate-700"
          onClick={() => void copy()}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <Check className="size-4 text-emerald-300" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
    </div>
  );
}
