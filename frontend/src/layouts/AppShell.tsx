import { Activity, LayoutDashboard, LogOut, Menu, Plus, Webhook, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Button } from "../components/Button";
import { useAuth } from "../features/auth/AuthProvider";

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/workflows", label: "Workflows", icon: Webhook },
  { to: "/executions", label: "Executions", icon: Activity },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
              isActive
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`size-4 ${isActive ? "text-emerald-300" : ""}`} aria-hidden="true" />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      void navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-[#091321] p-5 lg:flex">
        <Brand />
        <div className="mt-9">
          <NavItems />
        </div>
        <div className="mt-5">
          <NavLink
            to="/workflows/new"
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15"
          >
            <Plus className="size-4" aria-hidden="true" /> New workflow
          </NavLink>
        </div>
        <div className="mt-auto border-t border-slate-800 pt-5">
          <p className="truncate text-sm font-medium text-slate-200">{user?.email}</p>
          <p className="mt-1 text-xs text-slate-500">Personal workspace</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start"
            busy={isLoggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-[#08111f]/95 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg text-slate-300 hover:bg-slate-800"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-[min(20rem,88vw)] border-l border-slate-800 bg-[#091321] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="grid size-10 place-items-center rounded-lg text-slate-300 hover:bg-slate-800"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation panel"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-8">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <NavLink
              to="/workflows/new"
              onClick={() => setMobileOpen(false)}
              className="mt-5 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-slate-950"
            >
              <Plus className="size-4" aria-hidden="true" /> New workflow
            </NavLink>
            <div className="absolute inset-x-5 bottom-5 border-t border-slate-800 pt-5">
              <p className="truncate text-sm text-slate-300">{user?.email}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start"
                busy={isLoggingOut}
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" aria-hidden="true" /> Sign out
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[90rem] px-4 py-7 sm:px-6 sm:py-9 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
