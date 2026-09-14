"use client";

import Link from "next/link";
import PatientWorkspace from "@/components/patient-workspace";
import { useEffect, useState, useCallback } from "react";
import type { StatPeriod, ReferralStat, ContactFailure } from "@/lib/models";
import { maskedDoctorName } from "@/lib/display-name";

// ── Types ──────────────────────────────────────────────────────────────────

type DashboardStatus = "loading" | "syncing" | "ready" | "error";

interface SyncProgress {
  phase: string;
  message?: string;
  current?: number;
  total?: number;
}

interface ReferralResponse {
  contactFailures?: ContactFailure[];
  status: "ok" | "syncing" | "no_data" | "error";
  isSyncing?: boolean;
  lastSyncedAt?: string | null;
  stats?: Record<StatPeriod, ReferralStat>;
  message?: string;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PERIODS: { id: StatPeriod; label: string }[] = [
  { id: "alltime", label: "All Time"       },
  { id: "ytd",     label: "Year to Date"   },
  { id: "mtd",     label: "Month to Date"  },
  { id: "365d",    label: "Last 12 Months" },
  { id: "90d",     label: "Last 90 Days"   },
  { id: "30d",     label: "Last 30 Days"   },
  { id: "7d",      label: "Last 7 Days"    },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function Dashboard({ showcase = false }: { showcase?: boolean }) {
  const [status, setStatus]           = useState<DashboardStatus>("loading");
  const [stats, setStats]             = useState<Record<StatPeriod, ReferralStat> | null>(null);
  const [activePeriod, setActivePeriod] = useState<StatPeriod>("alltime");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing]     = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ phase: "fetching" });
  const [error, setError]             = useState<string | null>(null);

  const [contactFailures, setContactFailures] = useState<ContactFailure[]>([]);

  // ── Fetch dashboard data from MongoDB ─────────────────────────────────

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch(showcase ? "/api/showcase/referrals" : "/api/cliniko/referrals");
      const data: ReferralResponse = await res.json();

      if (data.status === "ok" && data.stats) {
        setContactFailures(data.contactFailures ?? []);
        setStats(data.stats);
        setLastSyncedAt(data.lastSyncedAt ?? null);
        setIsSyncing(data.isSyncing ?? false);
        setStatus("ready");
        return "ok";
      }

      if (data.status === "syncing") {
        setStatus("syncing");
        setSyncProgress({ phase: "fetching", message: "Sync already in progress on the server..." });
        return "syncing";
      }

      if (data.status === "no_data") {
        return "no_data";
      }

      setError(data.error ?? "Unknown error");
      setStatus("error");
      return "error";

    } catch {
      setError("Failed to reach the server. Please refresh.");
      setStatus("error");
      return "error";
    }
  }, [showcase]);

  // ── Trigger a sync and stream progress via SSE ─────────────────────────

  const startSync = useCallback((type: "full" | "incremental" = "full") => {
    if (showcase) return () => {};
    setContactFailures([]);
    setStatus("syncing");
    setSyncProgress({ phase: "fetching", message: "Starting sync..." });

    const es = new EventSource(`/api/sync?type=${type}`);

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.phase === "complete") {
          es.close();
          fetchDashboardData();
        } else if (parsed.phase === "warning") {
          setContactFailures(previous => [...previous, { contactId: parsed.contactId, message: parsed.message }]);
        } else if (parsed.phase === "error") {
          setError(parsed.error ?? "Sync failed");
          setStatus("error");
          es.close();
        } else {
          setSyncProgress(parsed);
        }
      } catch {
        console.error("Failed to parse SSE:", event.data);
      }
    };

    es.onerror = () => {
      setError("Sync connection lost. Please refresh.");
      setStatus("error");
      es.close();
    };

    return () => es.close();
  }, [fetchDashboardData, showcase]);

  // ── On mount: check MongoDB, auto-sync if empty ────────────────────────

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    async function initialize() {
      const result = await fetchDashboardData();
      if (cancelled) return;
      if (result === "no_data") {
        if (showcase) {
          setError("Showcase database is empty. Run the showcase seed command.");
          setStatus("error");
        } else cleanup = startSync("full");
      } else if (result === "syncing") {
        // Sync already running server-side — poll until it finishes
        const interval = setInterval(async () => {
          const r = await fetchDashboardData();
          if (r === "ok" || r === "error") clearInterval(interval);
        }, 5000);
        cleanup = () => clearInterval(interval);
      }
    }
    void initialize();

    return () => { cancelled = true; cleanup?.(); };
  }, [fetchDashboardData, startSync, showcase]);

  // ── Derived values ─────────────────────────────────────────────────────

  const activeStat = stats?.[activePeriod] ?? null;
  const syncPercent = syncProgress.total && syncProgress.total > 0
    ? Math.round(((syncProgress.current ?? 0) / syncProgress.total) * 100)
    : 0;

  const contactWarnings = contactFailures.length > 0 ? (
    <div role="alert" className="w-full max-w-2xl rounded-lg bg-amber-50 p-4 text-amber-900">
      <p className="font-semibold">{contactFailures.length} contact(s) could not be loaded</p>
      <p className="text-sm">Some referring doctors may be missing from the results. Retry with a full sync after resolving these errors.</p>
      <ul className="mt-2 max-h-48 overflow-auto text-sm">
        {contactFailures.map(failure => <li key={failure.contactId}>Contact {failure.contactId}: {failure.message}</li>)}
      </ul>
    </div>
  ) : null;

  // ── Render: loading ────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Connecting...</p>
      </div>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-lg max-w-md">
          <h2 className="font-semibold mb-1">Something went wrong</h2>
          <p className="text-sm">{error}</p>
          {showcase && <Link href="/login" className="underline">Back to login</Link>}
          {contactWarnings}
          <button
            onClick={() => { setStatus("loading"); setError(null); fetchDashboardData(); }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render: syncing ────────────────────────────────────────────────────

  if (status === "syncing") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">
            {stats ? "Updating Data" : "Loading Data for the First Time"}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {stats
              ? "A sync is running in the background. The dashboard will refresh when done."
              : "Fetching all patient data from Cliniko and saving to the database. This only happens once."}
          </p>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{syncProgress.message ?? "Working..."}</span>
              {syncProgress.total ? <span>{syncPercent}%</span> : null}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-cyan-600 h-3 rounded-full transition-all duration-300"
                style={{ width: syncProgress.total ? `${syncPercent}%` : "100%" }}
              />
            </div>
          </div>

          {contactWarnings}
          {syncProgress.current !== undefined && syncProgress.total !== undefined && (
            <p className="text-sm text-gray-500">
              Progress:{" "}
              <span className="font-medium text-gray-700">
                {syncProgress.current.toLocaleString()} / {syncProgress.total.toLocaleString()}
              </span>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Render: ready ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col gap-5 justify-center items-center">
      {showcase && <div className="w-full rounded-xl bg-cyan-100 p-4 text-sm text-cyan-950">Showcase · Fictional patient records fetched from MongoDB. <Link className="float-right underline" href="/login">Exit showcase</Link></div>}
      <PatientWorkspace showcase={showcase} />
      {/* Header */}
      <div className="flex-col text-center">
        <h1 className="text-5xl font-extrabold text-cyan-600">
          Referral overview
        </h1>
      </div>
      
      {/* Sync status bar */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        {lastSyncedAt && (
          <span>
            Last synced:{" "}
            {new Date(lastSyncedAt).toLocaleString("en-AU", {
              timeZone: "Australia/Sydney",
            })}
          </span>
        )}
        {!showcase && <button
          onClick={() => !isSyncing && startSync("incremental")}
          disabled={isSyncing}
          className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSyncing ? "Syncing..." : "Sync Now"}
        </button>}
      </div>

      {contactWarnings}
      {!showcase && contactFailures.length > 0 && (
        <button onClick={() => startSync("full")} disabled={isSyncing} className="rounded border px-3 py-1 text-sm text-gray-700">Retry full sync</button>
      )}

      {/* Period tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActivePeriod(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activePeriod === id
                ? "bg-cyan-600 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex justify-center w-full">
        <div className="bg-white rounded-xl border border-gray-100 w-full max-w-2xl shadow">
          <div className="overflow-y-auto max-h-150">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-200">
                <tr className="border-b">
                  <th className="text-left p-2 text-gray-600 font-bold rounded-tl-xl">
                    #
                  </th>
                  <th className="text-left p-2 text-gray-600 font-bold">
                    Doctor
                  </th>
                  <th className="text-right font-bold p-2 text-gray-600 rounded-tr-xl">
                    Patients
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeStat && activeStat.topReferrers.length > 0 ? (
                  activeStat.topReferrers.map((doctor, index) => (
                    <tr
                      key={doctor.doctorId}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-1 text-gray-500">{index + 1}</td>
                      <td className="px-3 py-1 text-gray-800 font-bold">
                        {maskedDoctorName(doctor.displayName)}
                      </td>
                      <td className="px-5 py-1 text-center font-bold text-black">
                        {doctor.count.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-gray-400">
                      No referral data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Footer stats */}
      <div className="p-4 flex justify-between w-full">
        <div className="flex">
          <p className="text-gray-600 text-sm">
            Total Patients: {activeStat?.totalPatients.toLocaleString() ?? "—"}
          </p>
        </div>
        <div className="flex">
          <p className="text-gray-600 text-sm">
            Patients referring doctor:{" "}
            <span className="font-medium text-black">
              {activeStat?.patientsWithReferrer.toLocaleString() ?? "—"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
