export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-[45vh] place-items-center" role="status">
      <div className="flex flex-col items-center gap-4 text-sm text-slate-400">
        <span className="spinner size-7" aria-hidden="true" />
        <span>{label}…</span>
      </div>
    </div>
  );
}
