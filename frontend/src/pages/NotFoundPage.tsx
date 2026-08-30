import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#08111f] px-5 text-center text-slate-100">
      <div>
        <div className="mb-12">
          <Brand />
        </div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-slate-700 bg-slate-900 text-sky-300">
          <Compass className="size-6" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          404 · Not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          This route went off course.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
          The page may have moved, or you may not have access to the requested resource.
        </p>
        <Link
          to="/dashboard"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
        >
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </div>
    </main>
  );
}
