"use client";
import { useEffect, useState } from "react";
import { Archivo } from "next/font/google";
import { Reveal } from "./overview/reveal";
import fixture from "@/lib/ui/overview-fixtures.json";
import type { StatPeriod, ReferralStat, ReceptionMessage, Receptionist } from "@/lib/models";
import type { NoShowStats, PatientMixStats, TodayApptStats, AppointmentVolumeStats } from "@/lib/attendance-stats";
import type { ReferralVolumeStats } from "@/lib/referrals";
import { OverviewHeader } from "./overview/overview-header";
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

const FALLBACK_KPIS = [
  ["27", "Today", "Appointments"],
  ["87", "+12% than last week", "New referrals, compared to last week"],
  ["642", "+8% than last week", "Appointments, compared to last week"],
] as const;

function formatDelta(deltaPercent: number | null): string {
  if (deltaPercent === null) return "No data for last week";
  const sign = deltaPercent > 0 ? "+" : "";
  return `${sign}${deltaPercent}%`;
}

interface KpiResponse {
  status: "ok" | "no_data" | "error";
  today?: TodayApptStats | null;
  appointments?: AppointmentVolumeStats | null;
  referrals?: ReferralVolumeStats | null;
}

interface ReferralResponse {
  status: "ok" | "syncing" | "no_data" | "error";
  lastSyncedAt?: string | null;
  stats?: Record<StatPeriod, ReferralStat>;
}

export default function PracticeOverview({
  greetingName,
  currentUser,
}: {
  greetingName: string | null;
  currentUser: string | null;
}) {
  const [practice, setPractice] = useState("All practices");
  const [filter, setFilter] = useState("All");
  const [mode, setMode] = useState("funding");
  const [mixRange, setMixRange] = useState("Last 30 Days");
  const [doctorRange, setDoctorRange] = useState("Last 30 Days");
  const [trendRange, setTrendRange] = useState("Last 30 Days");
  const [notice, setNotice] = useState("");
  const [referralStats, setReferralStats] = useState<Record<StatPeriod, ReferralStat> | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [noShowStats, setNoShowStats] = useState<NoShowStats | null>(null);
  const [patientMixStats, setPatientMixStats] = useState<PatientMixStats | null>(null);
  const [todayStats, setTodayStats] = useState<TodayApptStats | null>(null);
  const [apptVolume, setApptVolume] = useState<AppointmentVolumeStats | null>(null);
  const [referralVolume, setReferralVolume] = useState<ReferralVolumeStats | null>(null);
  const [receptionTasks, setReceptionTasks] = useState<ReceptionMessage[] | null>(null);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [practitioners, setPractitioners] = useState<{ _id: string; name: string }[]>([]);

  const refetchReceptionTasks = () => {
    fetch("/api/reception/messages?kind=task")
      .then((res) => res.json())
      .then((data: { messages?: ReceptionMessage[] }) => setReceptionTasks(data.messages ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    refetchReceptionTasks();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/reception/receptionists", { signal: controller.signal }).then((res) => res.json()),
      fetch("/api/reception/practitioners", { signal: controller.signal }).then((res) => res.json()),
    ])
      .then(([r, p]: [{ receptionists?: Receptionist[] }, { practitioners?: { _id: string; name: string }[] }]) => {
        setReceptionists(r.receptionists ?? []);
        setPractitioners(p.practitioners ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cliniko/kpis", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: KpiResponse) => {
        if (data.status === "ok") {
          setTodayStats(data.today ?? null);
          setApptVolume(data.appointments ?? null);
          setReferralVolume(data.referrals ?? null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

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
  const toggleReceptionTask = (id: string, completed: boolean) => {
    setReceptionTasks((prev) =>
      prev?.map((t) => (t._id === id ? { ...t, completedAt: completed ? new Date() : null } : t)) ?? prev,
    );
    fetch(`/api/reception/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    }).catch(() => {});
  };

  const updateReceptionTask = (
    id: string,
    input: { text: string; recipient: { type: "receptionist" | "practitioner"; id: string }; priority: "High" | "Routine" },
  ) => {
    setReceptionTasks((prev) => prev?.map((t) => (t._id === id ? { ...t, ...input } : t)) ?? prev);
    fetch(`/api/reception/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
      // The server is the authority on whether this login actually owns the task, so a rejection
      // (or a dropped request) means the optimistic edit above was wrong — refetch to undo it.
      .then((res) => {
        if (!res.ok) refetchReceptionTasks();
      })
      .catch(() => refetchReceptionTasks());
  };

  const deleteReceptionTask = (id: string) => {
    setReceptionTasks((prev) => prev?.filter((t) => t._id !== id) ?? prev);
    fetch(`/api/reception/messages/${id}`, { method: "DELETE" })
      // Same as the edit path: the server decides whether this login owns the task, so put the row
      // back if it says no.
      .then((res) => {
        if (!res.ok) refetchReceptionTasks();
      })
      .catch(() => refetchReceptionTasks());
  };

  const createReceptionTask = (input: { text: string; recipient: { type: "receptionist" | "practitioner"; id: string }; priority: "High" | "Routine" }) => {
    fetch("/api/reception/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "task", ...input }),
    })
      .then((res) => res.json())
      .then((data: { message?: ReceptionMessage }) => {
        if (data.message) setReceptionTasks((prev) => [data.message!, ...(prev ?? [])]);
      })
      .catch(() => {});
  };

  const preview = (label: string) => setNotice(`${label} · This detail screen is not connected yet.`);
  const selectRange = (setter: (v: string) => void, v: string) => {
    setter(v);
    setNotice("Range selection isn't wired to live data yet.");
  };
  const selectPeriod = (setter: (v: string) => void, v: string) => setter(v);

  async function logout() {
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      setNotice("Unable to log out. Please try again.");
    }
  }

  const periodForRange: Record<string, StatPeriod> = { "Last 7 Days": "7d", "Last 30 Days": "30d", "Year to Date": "ytd", "Last Year": "365d" };
  const doctors = referralStats?.[periodForRange[doctorRange] ?? "30d"]?.topReferrers.slice(0, 6) ?? null;
  const doctorsMax = doctors?.length ? Math.max(...doctors.map((d) => d.count)) : 1;

  // Small intra-row offset only — each Reveal below triggers off its own scroll-into-view, so rows
  // further down the page reveal when the user actually scrolls to them rather than on a fixed
  // page-load timer.
  const PANEL_STEP = 90;

  const kpis: readonly (readonly [string, string, string])[] = [
    todayStats
      ? [String(todayStats.completed + todayStats.remaining), 'Today', 'Appointments']
      : FALLBACK_KPIS[0],
    referralVolume
      ? [String(referralVolume.count), formatDelta(referralVolume.deltaPercent), 'New referrals, compared to last week']
      : FALLBACK_KPIS[1],
    apptVolume
      ? [String(apptVolume.count), formatDelta(apptVolume.deltaPercent), 'Appointments, compared to last week']
      : FALLBACK_KPIS[2],
  ];

  return (
    <main
      className={`min-h-screen bg-neutral-50 text-[#1a1a1a] ${archivo.className}`}
    >
      <OverviewHeader
        lastSyncedAt={lastSyncedAt}
        onLogout={logout}
        kpis={kpis}
        greetingName={greetingName}
      />

      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <Reveal>
          <h2 className="text-4xl font-extrabold tracking-tight">Actions</h2>
        </Reveal>

        <div className="grid gap-4 pb-5 lg:grid-cols-[1fr_1fr]">
          <Reveal delayMs={PANEL_STEP}>
            <HighlightedPatientsPanel
              visible={visible}
              filter={filter}
              onFilterChange={setFilter}
              practice={practice}
              onPracticeChange={setPractice}
              onPreview={preview}
            />
          </Reveal>
          <Reveal delayMs={PANEL_STEP * 2}>
            <ReceptionTodoPanel
              tasks={receptionTasks}
              receptionists={receptionists}
              practitioners={practitioners}
              currentUser={currentUser}
              onToggle={toggleReceptionTask}
              onCreate={createReceptionTask}
              onUpdate={updateReceptionTask}
              onDelete={deleteReceptionTask}
              onPreview={preview}
              onBriefingClose={refetchReceptionTasks}
            />
          </Reveal>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Reveal className="h-full">
            <PatientMixPanel
              mode={mode}
              onModeChange={setMode}
              mixRange={mixRange}
              onRangeChange={(v) => selectRange(setMixRange, v)}
              onPreviewCustomRange={() => preview("Custom date range")}
            />
          </Reveal>
          <Reveal className="flex flex-col gap-4" delayMs={PANEL_STEP}>
            <EpcPanel onPreview={preview} />
            <AhtrPanel onPreview={preview} />
          </Reveal>
        </div>
        <Reveal>
          <h2 className="text-4xl font-extrabold tracking-tight">Insights</h2>
        </Reveal>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Reveal className="flex flex-col gap-4">
            <NewVsReturningPanel
              trendRange={trendRange}
              onRangeChange={(v) => selectPeriod(setTrendRange, v)}
              onApplyCustomRange={() => preview("Custom date range")}
              stats={patientMixStats}
            />
            <NoShowsPanel stats={noShowStats} />
          </Reveal>
          <Reveal className="h-full" delayMs={PANEL_STEP}>
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
          </Reveal>
        </div>
      </div>
      {notice && (
        <NoticeToast message={notice} onDismiss={() => setNotice("")} />
      )}
    </main>
  );
}
