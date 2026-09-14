"use client";
import { useEffect, useMemo, useState } from "react";
import { Archivo } from "next/font/google";
import { Reveal } from "./overview/reveal";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { rangeSearch, resolvePeriod, type Period, type PeriodPreset } from "@/lib/date-range";
import { businessIdFor, PRACTICE_COOKIE, type PracticeChoice } from "@/lib/practices";
import fixture from "@/lib/ui/overview-fixtures.json";
import type { ReceptionMessage, Receptionist } from "@/lib/models";
import type { NoShowStats, PatientMixStats, TodayApptStats, AppointmentVolumeStats } from "@/lib/attendance-stats";
import type { ReferralVolumeStats, TopReferrer } from "@/lib/referrals";
import { OverviewHeader } from "./overview/overview-header";
import { HighlightedPatientsPanel } from "./overview/highlighted-patients-panel";
import { ReceptionTodoPanel } from "./overview/reception-todo-panel";
import { NoShowsPanel } from "./overview/no-shows-panel";
import { NewVsReturningPanel } from "./overview/new-vs-returning-panel";
import { PatientMixPanel } from "./overview/patient-mix-panel";
import { PatientMapPanel } from "./overview/patient-map-panel";
import { CareProgramsPanel } from "./overview/care-programs-panel";
import { TopReferringDoctorsPanel } from "./overview/top-referring-doctors-panel";
import { NoticeToast } from "./overview/notice-toast";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "800"] });

// Only shown on a tab's first load, before the live figures arrive (later loads read the session
// cache). Deliberately not realistic numbers: sample figures here were indistinguishable from real
// practice data during that gap.
const PENDING_KPIS = [
  ["—", "—", "Today", "Appointments"],
  ["—", "—", "—", "New referrals, compared to last week"],
  ["—", "—", "—", "Appointments, compared to last week"],
] as const;

const PRACTICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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
}

interface TopReferrersResponse {
  status: "ok" | "no_data";
  topReferrers?: TopReferrer[];
}

export default function PracticeOverview({
  greetingName,
  currentUser,
  initialPractice,
}: {
  greetingName: string | null;
  currentUser: string | null;
  // Where the user is rostered today, else the last practice they picked (see defaultPracticeFor).
  initialPractice: PracticeChoice;
}) {
  const [practice, setPractice] = useState<PracticeChoice>(initialPractice);
  const [filter, setFilter] = useState("All");
  const [mode, setMode] = useState("Funding");
  const [mixRange, setMixRange] = useState<Period>("Last 30 Days");
  const [doctorRange, setDoctorRange] = useState<Period>("Last 30 Days");
  const [trendRange, setTrendRange] = useState<PeriodPreset>("Last 30 Days");
  const [notice, setNotice] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  // Served from the per-tab session cache, so a refresh or re-entry renders the last numbers straight
  // away instead of "Loading real attendance data…", and every range change still refetches.
  // No-shows rides along on the same response but doesn't depend on the range. Because the previous
  // response stays on screen while a range this tab hasn't loaded is in flight, its chart no longer
  // blanks out and replays its animation whenever New vs Returning switches range.
  const { data: attendance } = useCachedFetch<{ status: string; noShows?: NoShowStats; patientMix?: PatientMixStats }>(
    `attendance:${trendRange}`,
    `/api/cliniko/attendance?range=${encodeURIComponent(trendRange)}`,
  );
  const noShowStats = attendance?.noShows ?? null;
  const patientMixStats = attendance?.patientMix ?? null;
  // Per practice, read from the per-tab session cache so a refresh — or switching back to a practice
  // already viewed — shows its last real figures immediately while the request refreshes them. The
  // previous practice's figures aren't carried over while a new one loads: the boxes show "—" rather
  // than another practice's numbers under this one's name.
  const practiceBusinessId = businessIdFor(practice);
  const { data: kpiData, isStale: kpisStale } = useCachedFetch<KpiResponse>(
    `kpis:${practice}`,
    `/api/cliniko/kpis${practiceBusinessId ? `?practice=${practiceBusinessId}` : ""}`,
  );
  const cachedKpis = kpisStale ? null : kpiData;
  const todayStats = cachedKpis?.today ?? null;
  const apptVolume = cachedKpis?.appointments ?? null;
  const referralVolume = cachedKpis?.referrals ?? null;
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
    fetch("/api/cliniko/referrals", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: ReferralResponse) => {
        if (data.status === "ok") setLastSyncedAt(data.lastSyncedAt ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const selectPractice = (next: PracticeChoice) => {
    setPractice(next);
    // Remembered as the last-used practice, which the dashboard opens on next time the user isn't
    // rostered anywhere that day (see PRACTICE_COOKIE).
    document.cookie = `${PRACTICE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${PRACTICE_COOKIE_MAX_AGE}; samesite=lax`;
  };

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
  // New vs Returning is still served from per-preset stats precomputed during sync, so it can't answer
  // a custom range yet.
  const selectTrendRange = (v: Period) => (typeof v === "string" ? setTrendRange(v) : preview("Custom date range"));

  async function logout() {
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      setNotice("Unable to log out. Please try again.");
    }
  }

  // Keyed by the resolved days rather than the preset name, so after midnight a preset moves on to the
  // new window instead of serving the previous day's cached one.
  const doctorDays = resolvePeriod(doctorRange);
  const { data: referrersData } = useCachedFetch<TopReferrersResponse>(
    `top-referrers:${doctorDays.from}:${doctorDays.to}`,
    `/api/cliniko/referrals/top?${rangeSearch(doctorDays)}`,
  );

  // Memoised so the array keeps its identity across unrelated re-renders. The doctors panel replays
  // its grow-in whenever this value changes identity, and both `.slice()` and the fixture `.map()`
  // build a fresh array every render — so without this, toggling any other state that lives in
  // this component (e.g. the patient-mix mode) made the doctors' bars collapse and regrow too.
  const doctors = useMemo(() => {
    const real = referrersData?.status === "ok" ? referrersData.topReferrers?.slice(0, 6) : undefined;
    return (
      real ??
      fixture.doctors.slice(0, 6).map((d) => ({
        doctorId: d.name,
        displayName: `${d.name} (${d.practice})`,
        count: d.value,
      }))
    );
  }, [referrersData]);
  const doctorsMax = doctors.length ? Math.max(...doctors.map((d) => d.count)) : 1;

  // Small intra-row offset only — each Reveal below triggers off its own scroll-into-view, so rows
  // further down the page reveal when the user actually scrolls to them rather than on a fixed
  // page-load timer.
  const PANEL_STEP = 90;

  const kpis: readonly (readonly [string, string, string, string])[] = [
    todayStats
      ? [
          "Appt.",
          String(todayStats.completed + todayStats.remaining),
          "Today",
          "Appointments",
        ]
      : PENDING_KPIS[0],
    referralVolume
      ? [
          "Ref.",
          String(referralVolume.count),
          formatDelta(referralVolume.deltaPercent),
          "New referrals, compared to last week",
        ]
      : PENDING_KPIS[1],
    apptVolume
      ? [
          "Appt. W.",
          String(apptVolume.count),
          formatDelta(apptVolume.deltaPercent),
          "Appointments, compared to last week",
        ]
      : PENDING_KPIS[2],
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
        practice={practice}
        onPracticeChange={selectPractice}
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
              onBriefingClose={refetchReceptionTasks}
            />
          </Reveal>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Reveal className="h-full">
            <PatientMixPanel
              mode={mode}
              onModeChange={setMode}
              period={mixRange}
              onPeriodChange={setMixRange}
            />
          </Reveal>
          <Reveal className="grid grid-rows-[300px_300px] gap-4 lg:h-full lg:grid-rows-[300px_minmax(0,1fr)]" delayMs={PANEL_STEP}>
            <CareProgramsPanel onPreview={preview} />
            <TopReferringDoctorsPanel
              doctors={doctors}
              doctorsMax={doctorsMax}
              doctorRange={doctorRange}
              onRangeChange={setDoctorRange}
            />
          </Reveal>
        </div>
        <Reveal>
          <h2 className="text-4xl font-extrabold tracking-tight">Insights</h2>
        </Reveal>
        <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_1fr]">
          <Reveal className="flex h-full flex-col gap-4">
            <NewVsReturningPanel
              trendRange={trendRange}
              onRangeChange={selectTrendRange}
              stats={patientMixStats}
            />
            <NoShowsPanel stats={noShowStats} />
          </Reveal>
          <Reveal className="relative min-h-0 self-stretch" delayMs={PANEL_STEP}>
            <PatientMapPanel fillHeight />
          </Reveal>
        </div>
      </div>
      {notice && (
        <NoticeToast message={notice} onDismiss={() => setNotice("")} />
      )}
    </main>
  );
}
