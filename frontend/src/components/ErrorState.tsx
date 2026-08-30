import { RefreshCw } from "lucide-react";
import { ApiError } from "../api/client";
import { Button } from "./Button";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.message : "Something went wrong while loading this page.";
  return (
    <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-6" role="alert">
      <h2 className="font-semibold text-rose-100">We could not load this data</h2>
      <p className="mt-2 text-sm leading-6 text-rose-200/75">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" /> Try again
        </Button>
      ) : null}
    </div>
  );
}
