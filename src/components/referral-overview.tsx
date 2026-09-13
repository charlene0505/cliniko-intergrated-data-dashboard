"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archivo } from "next/font/google";
import type { StatPeriod, ReferralStat } from "@/lib/models";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
});

const PERIODS: { id: StatPeriod; label: string }[] = [
  { id: "alltime", label: "All Time" },
  { id: "ytd", label: "Year to Date" },
  { id: "mtd", label: "Month to Date" },
  { id: "365d", label: "Last 12 Months" },
  { id: "90d", label: "Last 90 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "7d", label: "Last 7 Days" },
];

// Referral source mix, needs-attention alerts and the monthly trend line are presentation
// fixtures transcribed from the design mockup — real per-source-channel and historical
// booking data isn't tracked yet. The doctors table and KPI counts below use live MongoDB data.
const sources = [
  ["GP / medical centre", 62, "#0b7276"],
  ["Word of mouth", 14, "#14a3a8"],
  ["Google / website", 11, "#8fd3ee"],
  ["Specialist", 7, "#e8dfa0"],
  ["Existing patient", 4, "#f0a070"],
  ["WorkCover / insurer", 2, "#dad7cf"],
] as const;
const alerts = [
  ["Dr James Whitlock", "7 referrals, down from 11 last quarter", "Dropping"],
  ["Dr Colin Beauchamp", "4 referrals, none in the last two weeks", "Dropping"],
  ["Riverbend Medical", "First referral 1 Sep · 6 already", "New"],
  ["14 referrals never booked", "Received but no appointment made", "Chase"],
] as const;
const points = [62, 71, 58, 79, 74, 83, 91, 48]
  .map(
    (v, i) =>
      `${((i * 100) / 7).toFixed(2)},${(34 - (v / 100) * 32).toFixed(2)}`,
  )
  .join(" ");

const segWrap =
  "flex flex-wrap gap-0.5 rounded-3xl border border-black/10 bg-white p-1";
const segBtn =
  "rounded-full px-4 py-2 text-xs whitespace-nowrap transition-colors";
const card = "min-w-0 rounded-[20px] border border-black/10 bg-white p-6";
const link =
  "cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#0b7276] hover:text-[#14a3a8]";
const tagBase =
  "inline-block rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap";
const tagAlert = `${tagBase} bg-[#fbe8dc] text-[#a3561f]`;
const tagNew = `${tagBase} bg-[#e3f4f5] text-[#0b7276]`;
const tagFlat = `${tagBase} bg-[#f1efe9] text-black/70`;
const track = "h-2 overflow-hidden rounded-full bg-[#e6e3dc]";

function Range({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className={segWrap}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={selected === option}
          onClick={() => onSelect(option)}
          className={`${segBtn} ${selected === option ? "bg-[#1a1a1a] font-semibold text-white" : "font-medium text-black/60 hover:text-black/80"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

interface ReferralResponse {
  status: "ok" | "syncing" | "no_data" | "error";
  lastSyncedAt?: string | null;
  stats?: Record<StatPeriod, ReferralStat>;
}

function splitDoctor(displayName: string) {
  const match = displayName.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return match
    ? { name: match[1], practice: match[2] }
    : { name: displayName, practice: "" };
}

export default function ReferralOverview() {
  const [period, setPeriod] = useState<StatPeriod>("alltime");
  const [stats, setStats] = useState<Record<StatPeriod, ReferralStat> | null>(
    null,
  );
  const [trendRange, setTrendRange] = useState("6 mo");
  const [sourceRange, setSourceRange] = useState("Last month");
  const [notice, setNotice] = useState("");
  const [from, setFrom] = useState("2026-06-01");
  const [to, setTo] = useState("2026-09-12");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cliniko/referrals", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: ReferralResponse) => {
        if (data.status === "ok" && data.stats) setStats(data.stats);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const stat = stats?.[period];
  const fromDoctorsPct =
    stat && stat.totalPatients
      ? Math.round((stat.patientsWithReferrer / stat.totalPatients) * 100)
      : null;
  const kpis = [
    [
      "Total referrals",
      stat ? stat.patientsWithReferrer.toLocaleString() : "—",
      `${stat?.totalPatients.toLocaleString() ?? "—"} total patients`,
    ],
    [
      "From doctors",
      fromDoctorsPct !== null ? `${fromDoctorsPct}%` : "—",
      stat
        ? `${stat.patientsWithReferrer} of ${stat.totalPatients} patients`
        : "",
    ],
    [
      "Active referrers",
      stat ? stat.topReferrers.length.toLocaleString() : "—",
      "Distinct referring doctors",
    ],
    ["Referral to booking", "—", "Booking data not tracked yet"],
  ] as const;

  function selectRange(setter: (value: string) => void, value: string) {
    setter(value);
    setNotice("UI preview: figures remain the reference sample data.");
  }
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setNotice("Unable to log out. Please try again.");
  }

  return (
    <main
      className={`min-h-screen bg-[#eae8e3] text-[#1a1a1a] ${archivo.className}`}
    >
      <header className="border-b border-black/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-7 py-3.5">
          <span className="flex items-center gap-1.5 text-xs text-black/60">
            <span className="block h-1.5 w-1.5 rounded-full bg-[#14a3a8]" />
            Cliniko Integrated Smart Dashboard
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-[#1a1a1a] bg-[#1a1a1a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0e8a8f] hover:border-[#0e8a8f]"
          >
            Log out
          </button>
        </div>
        <div className="px-7 py-5">
          <Link
            className="mb-1.5 inline-block text-lg font-semibold text-[#0b7276] hover:text-[#14a3a8]"
            href="/"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            Referral sources
          </h1>
        </div>
      </header>
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map(([kLabel, value, note]) => (
            <article
              key={kLabel}
              className="flex min-w-0 flex-col gap-1.5 rounded-[18px] border border-black/10 bg-white p-5"
            >
              <div className="text-[10.5px] font-semibold uppercase tracking-widest text-black/55">
                {kLabel}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">
                  {value}
                </span>
              </div>
              <p className="text-xs text-black/55">{note}</p>
            </article>
          ))}
        </div>

        <section className={`${card} flex flex-col gap-3.5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">
              Referrals received per month
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-black/55">
                GP and medical centre referrals only
              </span>
              <Range
                options={["6 mo", "12 mo", "24 mo"]}
                selected={trendRange}
                onSelect={(value) => selectRange(setTrendRange, value)}
              />
            </div>
          </div>
          <svg
            viewBox="0 0 100 34"
            preserveAspectRatio="none"
            className="block h-[150px] w-full"
            role="img"
            aria-label="Sample monthly referrals: February 62, March 71, April 58, May 79, June 74, July 83, August 91, September 48"
          >
            <polyline
              points={`0,34 ${points} 100,34`}
              fill="rgba(20,163,168,.10)"
              stroke="none"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#14a3a8"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex justify-between border-t border-black/10 pt-2 text-[10.5px] uppercase tracking-widest text-black/50">
            {["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"].map(
              (month) => (
                <span key={month}>{month}</span>
              ),
            )}
          </div>
        </section>

        <section className={`${card} pb-3`}>
          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">
              Referring doctors
            </h2>
            <Range
              options={PERIODS.map((p) => p.label)}
              selected={
                PERIODS.find((p) => p.id === period)?.label ?? "All Time"
              }
              onSelect={(label) =>
                setPeriod(
                  PERIODS.find((p) => p.label === label)?.id ?? "alltime",
                )
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    "Doctor",
                    "Practice",
                    "Referrals",
                    "EPC",
                    "Booked",
                    "Last referral",
                    "vs prev",
                  ].map((title, i) => (
                    <th
                      key={title}
                      className={`whitespace-nowrap border-b border-black/10 px-2.5 pb-2 text-left text-[10.5px] font-semibold uppercase tracking-widest text-black/55 ${[2, 3, 4, 6].includes(i) ? "text-right" : ""}`}
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stat?.topReferrers.map((doctor) => {
                  const { name, practice } = splitDoctor(doctor.displayName);
                  return (
                    <tr key={doctor.doctorId}>
                      <td className="border-b border-black/10 px-2.5 py-2.5">
                        <button
                          className={link}
                          onClick={() =>
                            setNotice(
                              `${name} — patient drill-down isn't connected yet.`,
                            )
                          }
                        >
                          {name}
                        </button>
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-black/70">
                        {practice}
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-right font-semibold tabular-nums">
                        {doctor.count}
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-right tabular-nums text-black/40">
                        —
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-right tabular-nums text-black/40">
                        —
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-black/40">
                        —
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-right text-black/40">
                        —
                      </td>
                    </tr>
                  );
                })}
                {!stat && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2.5 py-6 text-center text-black/50"
                    >
                      Loading referral data…
                    </td>
                  </tr>
                )}
                {stat && !stat.topReferrers.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2.5 py-6 text-center text-black/50"
                    >
                      No referrals recorded for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-black/45">
            EPC, Booked, Last referral and vs prev aren&apos;t tracked yet —
            shown as — until that data is synced.
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {/* <section className={`${card} flex flex-col gap-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">
                Referral source mix
              </h2>
              <Range
                options={["Last week", "Last month", "Last quarter", "Custom"]}
                selected={sourceRange}
                onSelect={(value) => selectRange(setSourceRange, value)}
              />
            </div>
            {sourceRange === "Custom" && (
              <form
                className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/10 bg-[#f7f5ef] p-3.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotice(
                    from > to
                      ? "The end date must be on or after the start date."
                      : `Preview range: ${from} to ${to}. Figures are sample data.`,
                  );
                }}
              >
                <label className="flex flex-col gap-1 text-[10.5px] font-semibold uppercase tracking-widest text-black/55">
                  From
                  <input
                    type="date"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="min-h-9 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10.5px] font-semibold uppercase tracking-widest text-black/55">
                  To
                  <input
                    type="date"
                    required
                    min={from}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="min-h-9 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full border border-[#14a3a8] bg-[#14a3a8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0e8a8f]"
                >
                  Apply
                </button>
              </form>
            )}
            <div className="flex flex-col gap-3">
              {sources.map(([sLabel, percent, color]) => (
                <div className="flex flex-col gap-1.5" key={sLabel}>
                  <div className="flex items-baseline justify-between gap-2.5 text-sm">
                    <span>{sLabel}</span>
                    <strong className="font-extrabold tabular-nums">
                      {percent}%
                    </strong>
                  </div>
                  <div className={track}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${percent}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section> */}
          <section className={`${card} flex flex-col gap-3.5`}>
            <h2 className="text-base font-semibold tracking-tight">
              Needs attention
            </h2>
            <p className="text-xs leading-relaxed text-black/60">
              Referrers whose volume dropped, and practices you have never heard
              from.
            </p>
            <div>
              {alerts.map(([name, note, tag]) => (
                <div
                  className="flex items-center justify-between gap-3 border-b border-black/10 py-2.5 last:border-0"
                  key={name}
                >
                  <div className="min-w-0">
                    <strong className="text-sm font-semibold">{name}</strong>
                    <p className="mt-0.5 text-xs text-black/55">{note}</p>
                  </div>
                  <span
                    className={
                      tag === "Dropping"
                        ? tagAlert
                        : tag === "New"
                          ? tagNew
                          : tagFlat
                    }
                  >
                    {tag}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-20 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-5 rounded-2xl bg-[#1a1a1a] px-5 py-3.5 text-xs text-white shadow-xl"
        >
          <span>{notice}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
            className="text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
