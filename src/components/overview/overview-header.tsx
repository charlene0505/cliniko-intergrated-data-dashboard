"use client";

import { KpiGrid } from "./kpi-grid";

export function OverviewHeader({
  lastSyncedAt,
  onLogout,
  kpis,
  greetingName,
}: {
  lastSyncedAt: string | null;
  onLogout: () => void;
  kpis: readonly (readonly [string, string, string])[];
  greetingName: string | null;
}) {
  return (
    <header className=" bg-neutral-50">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-7 py-3.5">
        <span className="flex items-center gap-1.5 text-xs text-black/60">
          <span className="block h-1.5 w-1.5 rounded-full bg-teal-500" />
          {lastSyncedAt
            ? `Cliniko · synced ${new Date(lastSyncedAt).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit" })}`
            : "Cliniko Integrated Smart Dashboard"}
        </span>
        <button
          onClick={onLogout}
          className="rounded-full border border-ink bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600 hover:border-teal-600"
        >
          Log out
        </button>
      </div>
      <div className="px-7 py-5">
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-3xl bg-banner p-7">
          <div className="min-w-[230px] flex-1">
            <p className="text-xs text-black/60">
              {new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Hello, {greetingName ?? "there"}</h1>
          </div>
          <KpiGrid items={kpis} compact />
          <div className="flex flex-col items-end justify-center">
            <p className="mt-1 text-4xl font-extrabold">Sydney</p>
            <p className="mt-1 text-xl font-medium">Physiotherapy</p>
          </div>
        </div>
      </div>
    </header>
  );
}
