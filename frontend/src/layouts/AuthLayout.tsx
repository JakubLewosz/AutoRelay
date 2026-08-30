import { CheckCircle2, GitBranch, ShieldCheck, Webhook } from "lucide-react";
import { Outlet } from "react-router-dom";
import { Brand } from "../components/Brand";

const capabilities = [
  { icon: Webhook, text: "Unique webhook endpoints for every workflow" },
  { icon: GitBranch, text: "Safe conditions and retryable delivery" },
  { icon: ShieldCheck, text: "Encrypted configuration and private sessions" },
];

export function AuthLayout() {
  return (
    <main className="min-h-screen bg-[#08111f] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)]">
      <section className="relative hidden overflow-hidden border-r border-slate-800 bg-[#0a1525] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="auth-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          <Brand linked={false} />
        </div>
        <div className="relative max-w-xl py-16">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Webhook automation, kept focused
          </p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.055em] text-white">
            Relay important events to the right destination.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
            Build focused webhook workflows, apply one clear condition, and follow every delivery
            from queue to result.
          </p>
          <ul className="mt-9 space-y-4">
            {capabilities.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="grid size-8 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" />
          Built for transparent, inspectable automation.
        </p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Brand linked={false} />
          </div>
          <Outlet />
        </div>
      </section>
    </main>
  );
}
