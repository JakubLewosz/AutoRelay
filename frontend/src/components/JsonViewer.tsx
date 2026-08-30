export function JsonViewer({ value, label }: { value: unknown; label: string }) {
  const content =
    value === null || value === undefined ? "No data recorded." : JSON.stringify(value, null, 2);
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">{label}</h2>
      <pre className="max-h-[28rem] overflow-auto rounded-xl border border-slate-800 bg-[#060d18] p-4 font-mono text-xs leading-6 text-slate-300">
        <code>{content}</code>
      </pre>
    </section>
  );
}
