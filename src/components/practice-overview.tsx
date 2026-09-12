"use client";
import { useEffect, useState } from "react";
import { Archivo } from "next/font/google";
import fixture from "@/lib/ui/overview-fixtures.json";
import type { StatPeriod, ReferralStat } from "@/lib/models";
import type { NoShowStats, PatientMixStats } from "@/lib/attendance-stats";
import { Segments } from "./overview/segments";
import { OverviewHeader } from "./overview/overview-header";
import { KpiGrid } from "./overview/kpi-grid";
import { HighlightedPatientsPanel } from "./overview/highlighted-patients-panel";
import { ReceptionTodoPanel } from "./overview/reception-todo-panel";
import { NoShowsPanel } from "./overview/no-shows-panel";
import { NewVsReturningPanel } from "./overview/new-vs-returning-panel";
import { PatientMixPanel } from "./overview/patient-mix-panel";
import { EpcPanel } from "./overview/epc-panel";
import { AhtrPanel } from "./overview/ahtr-panel";
import { TopReferringDoctorsPanel } from "./overview/top-referring-doctors-panel";
import { NoticeToast } from "./overview/notice-toast";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "800"] });

const kpis = [
  ["New referrals", "87", "+12%"],
  ["Appointments", "642", "+8%"],
  ["Follow-ups due", "23", "9 overdue"],
  ["EPC at risk", "14", "4 expiring"],
  ["No-shows", "4.1%", "+0.6"],
] as const;

interface ReferralResponse {
  status: "ok" | "syncing" | "no_data" | "error";
  lastSyncedAt?: string | null;
  stats?: Record<StatPeriod, ReferralStat>;
}

export default function PracticeOverview() {
  const [practice, setPractice] = useState("All practices");
  const [filter, setFilter] = useState("All");
  const [done, setDone] = useState<string[]>([]);
  const [mode, setMode] = useState("funding");
  const [mixRange, setMixRange] = useState("Last month");
  const [doctorRange, setDoctorRange] = useState("Last month");
  const [trendRange, setTrendRange] = useState("Last month");
  const [notice, setNotice] = useState("");
  const [referralStats, setReferralStats] = useState<Record<StatPeriod, ReferralStat> | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [noShowStats, setNoShowStats] = useState<NoShowStats | null>(null);
  const [patientMixStats, setPatientMixStats] = useState<PatientMixStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cliniko/referrals", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: ReferralResponse) => {
        if (data.status === "ok" && data.stats) {
          setReferralStats(data.stats);
          setLastSyncedAt(data.lastSyncedAt ?? null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/cliniko/attendance?range=${encodeURIComponent(trendRange)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { status: string; noShows?: NoShowStats; patientMix?: PatientMixStats }) => {
        if (data.status === "ok") {
          setNoShowStats(data.noShows ?? null);
          setPatientMixStats(data.patientMix ?? null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [trendRange]);

  const visible = fixture.highlights.filter(
    (h) => (practice === "All practices" || h.practice === practice) && (filter === "All" || h.reason === filter),
  );
  const tasks = fixture.tasks.filter((t) => !done.includes(t.id));
  const preview = (label: string) => setNotice(`${label} · This detail screen is not connected yet.`);
  const selectRange = (setter: (v: string) => void, v: string) => {
    setter(v);
    setNotice("Range selection isn't wired to live data yet.");
  };
  // "Last week"/"Last month"/"Last quarter" are wired to real data; only "Custom" isn't yet.
  const selectPeriod = (setter: (v: string) => void, v: string) => {
    setter(v);
    if (v === "Custom") setNotice("Custom date ranges aren't wired to live data yet.");
  };

  async function logout() {
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      setNotice("Unable to log out. Please try again.");
    }
  }

  const periodForRange: Record<string, StatPeriod> = { "Last week": "7d", "Last month": "30d", "Last quarter": "90d" };
  const doctors = referralStats?.[periodForRange[doctorRange] ?? "30d"]?.topReferrers.slice(0, 6) ?? null;
  const doctorsMax = doctors?.length ? Math.max(...doctors.map((d) => d.count)) : 1;

  return (
    <main
      className={`min-h-screen bg-neutral-50 text-[#1a1a1a] ${archivo.className}`}
    >
      <OverviewHeader lastSyncedAt={lastSyncedAt} onLogout={logout} />

      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <KpiGrid items={kpis} />

        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-extrabold tracking-tight">Actions</h2>
          <Segments
            options={["Hurstville", "CBD", "All practices"]}
            value={practice}
            onChange={setPractice}
          />
        </div>

        <div className="grid gap-4  pb-5 lg:grid-cols-[2fr_1fr]">
          <HighlightedPatientsPanel
            visible={visible}
            filter={filter}
            onFilterChange={setFilter}
            onPreview={preview}
          />
          <ReceptionTodoPanel
            tasks={tasks}
            done={done}
            onCheck={(id) => setDone([...done, id])}
            onReset={() => setDone([])}
            onPreview={preview}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <PatientMixPanel
            mode={mode}
            onModeChange={setMode}
            mixRange={mixRange}
            onRangeChange={(v) => selectRange(setMixRange, v)}
            onPreviewCustomRange={() => preview("Custom date range")}
            onPreviewBookings={() => preview("Bookings")}
          />
          <div className="flex flex-col gap-4">
            <EpcPanel onPreview={preview} />
            <AhtrPanel onPreview={preview} />
          </div>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight">Insights</h2>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-4">
            <NoShowsPanel stats={noShowStats} />
            <NewVsReturningPanel
              trendRange={trendRange}
              onRangeChange={(v) => selectPeriod(setTrendRange, v)}
              onApplyCustomRange={() => preview("Custom date range")}
              stats={patientMixStats}
            />
          </div>
          <TopReferringDoctorsPanel
            doctors={
              doctors ??
              fixture.doctors.slice(0, 6).map((d) => ({
                doctorId: d.name,
                displayName: `${d.name} (${d.practice})`,
                count: d.value,
              }))
            }
            doctorsMax={doctorsMax}
            doctorRange={doctorRange}
            onRangeChange={(v) => selectPeriod(setDoctorRange, v)}
            onPreviewCustomRange={() => preview("Custom date range")}
          />
        </div>
      </div>
      {notice && (
        <NoticeToast message={notice} onDismiss={() => setNotice("")} />
      )}
    </main>
  );
}
