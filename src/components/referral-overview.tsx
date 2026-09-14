"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Archivo } from "next/font/google";
import type { StatPeriod, ReferralStat } from "@/lib/models";
import { maskedDoctorName } from "@/lib/display-name";
import { PeriodSelector } from "./overview/period-selector";
import type { Period, PeriodPreset } from "@/lib/date-range";
import { useScrollReveal } from "@/lib/use-scroll-reveal";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
});

const PERIODS: { id: StatPeriod; label: string }[] = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "365d", label: "Last 12 Months" },
  { id: "mtd", label: "Month to Date" },
  { id: "ytd", label: "Year to Date" },
  { id: "alltime", label: "All Time" },
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
const doctorPreview = [
  { epc: 18, booked: 21, lastReferral: "12 Sep", change: "+18%" },
  { epc: 14, booked: 17, lastReferral: "11 Sep", change: "+9%" },
  { epc: 12, booked: 14, lastReferral: "10 Sep", change: "−6%" },
  { epc: 9, booked: 12, lastReferral: "8 Sep", change: "+12%" },
  { epc: 8, booked: 10, lastReferral: "6 Sep", change: "−14%" },
  { epc: 6, booked: 8, lastReferral: "4 Sep", change: "+4%" },
] as const;
const previewFactor: Record<StatPeriod, number> = {
  "7d": 0.3,
  "30d": 0.65,
  "90d": 1,
  "365d": 2.8,
  mtd: 0.45,
  ytd: 2.2,
  alltime: 4.5,
};
const previewChanges: Record<StatPeriod, readonly string[]> = {
  "7d": ["+8%", "−4%", "+15%", "+3%", "−9%", "+11%"],
  "30d": ["+12%", "+6%", "−8%", "+17%", "−5%", "+2%"],
  "90d": ["+18%", "+9%", "−6%", "+12%", "−14%", "+4%"],
  "365d": ["+24%", "+15%", "+7%", "−3%", "+11%", "−8%"],
  mtd: ["+5%", "−7%", "+10%", "+4%", "−12%", "+6%"],
  ytd: ["+21%", "+13%", "−2%", "+9%", "+5%", "−6%"],
  alltime: ["+31%", "+22%", "+16%", "+12%", "+8%", "+4%"],
};
const referralTrendFixtures: Record<PeriodPreset, { label: string; value: number }[]> = {
  "Last 7 Days": [42, 51, 47, 63, 58, 69, 61].map((value, index) => ({ label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], value })),
  "Last 30 Days": [58, 66, 73, 69].map((value, index) => ({ label: `W${index + 1}`, value })),
  "Year to Date": [62, 71, 58, 79, 74, 83, 91, 76, 88].map((value, index) => ({ label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"][index], value })),
  "Last Year": [55, 62, 71, 58, 79, 74, 83, 91, 76, 88, 81, 94].map((value, index) => ({ label: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"][index], value })),
};

const TREND_X_PAD = 7;
const TREND_Y_TOP = 24;
const TREND_Y_BOTTOM = 84;

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink"
      >
        {selected}
        <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-2xl border border-black/10 bg-white py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={selected === option}
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs whitespace-nowrap transition-colors ${
                selected === option ? "bg-ink font-semibold text-white" : "font-medium text-black/70 hover:bg-black/5"
              }`}
            >
              {option}
              {selected === option && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
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
    ? { name: maskedDoctorName(match[1]), practice: match[2] }
    : { name: maskedDoctorName(displayName), practice: "" };
}

export default function ReferralOverview() {
  const [period, setPeriod] = useState<StatPeriod>("7d");
  const [stats, setStats] = useState<Record<StatPeriod, ReferralStat> | null>(
    null,
  );
  const [trendRange, setTrendRange] = useState<Period>("Last Year");
  const [sourceRange, setSourceRange] = useState("Last month");
  const [notice, setNotice] = useState("");
  const [from, setFrom] = useState("2026-06-01");
  const [to, setTo] = useState("2026-09-12");
  const [trendRef, trendEntered] = useScrollReveal<HTMLDivElement>();

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
  const trend = referralTrendFixtures[typeof trendRange === "string" ? trendRange : "Last Year"];
  const trendMax = Math.max(...trend.map((item) => item.value), 1);
  const trendX = (index: number) => trend.length < 2 ? 50 : TREND_X_PAD + (index / (trend.length - 1)) * (100 - 2 * TREND_X_PAD);
  const trendY = (value: number) => TREND_Y_TOP + (1 - value / trendMax) * (TREND_Y_BOTTOM - TREND_Y_TOP);
  const latestTrend = trend.at(-1)?.value ?? 0;
  const previousTrend = trend.at(-2)?.value ?? latestTrend;
  const trendDelta = latestTrend - previousTrend;
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
            Referral Sources
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
          <h2 className="text-base font-semibold tracking-tight">Referrals Received</h2>
          <PeriodSelector value={trendRange} onChange={setTrendRange} />
          <div>
            {/* <div className="flex items-baseline gap-2.5 text-[34px] font-semibold tracking-tight">
              {latestTrend}
              <small className={trendDelta >= 0 ? "text-xs font-semibold text-teal-700" : "text-xs font-semibold text-clay"}>
                {trendDelta > 0 ? "+" : ""}{trendDelta} vs previous
              </small>
            </div> */}
            {/* <p className="text-xs leading-relaxed text-black/60">GP and medical centre referrals · fixture data</p> */}
          </div>
          <div ref={trendRef} className="relative h-28 w-full" role="img" aria-label={`Sample referrals by period: ${trend.map((item) => `${item.label} ${item.value}`).join(", ")}`}>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              style={{
                clipPath: trendEntered ? "inset(-20% 0 -20% 0)" : "inset(-20% 100% -20% 0)",
                transition: "clip-path 900ms ease-out",
              }}
            >
              <polyline
                points={trend.map((item, index) => `${trendX(index)},${trendY(item.value)}`).join(" ")}
                fill="none"
                stroke="#14a3a8"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {trend.map((item, index) => (
              <div key={item.label} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2" style={{ left: `${trendX(index)}%`, top: `${trendY(item.value)}%` }}>
                <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 text-xs font-semibold tabular-nums whitespace-nowrap text-ink transition-opacity duration-300" style={{ opacity: trendEntered ? 1 : 0, transitionDelay: `${300 + index * 90}ms` }}>{item.value}</span>
                <span className="block h-full w-full rounded-full border-2 border-white transition-transform duration-300" style={{ background: index === trend.length - 1 ? "#f0a070" : "#14a3a8", transform: trendEntered ? "scale(1)" : "scale(0)", transitionDelay: `${300 + index * 90}ms` }} />
              </div>
            ))}
            {trend.map((item, index) => (
              <span key={item.label} className="absolute bottom-0 -translate-x-1/2 text-[10.5px] uppercase tracking-widest whitespace-nowrap text-black/50" style={{ left: `${trendX(index)}%` }}>{item.label}</span>
            ))}
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <section className={`${card} pb-3`}>
          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight">
              Referring Doctors
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
                {stat?.topReferrers.map((doctor, index) => {
                  const { name, practice } = splitDoctor(doctor.displayName);
                  const basePreview = doctorPreview[index % doctorPreview.length];
                  const factor = previewFactor[period];
                  const preview = {
                    epc: Math.max(1, Math.round(basePreview.epc * factor)),
                    booked: Math.max(1, Math.round(basePreview.booked * factor)),
                    lastReferral: basePreview.lastReferral,
                    change: previewChanges[period][index % previewChanges[period].length],
                  };
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
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-right tabular-nums text-black/70">
                        {preview.epc}
                      </td>
                      <td className="border-b border-black/10 px-2.5 py-2.5 text-right tabular-nums text-black/70">
                        {preview.booked}
                      </td>
                      <td className="whitespace-nowrap border-b border-black/10 px-2.5 py-2.5 text-black/70">
                        {preview.lastReferral}
                      </td>
                      <td className={`border-b border-black/10 px-2.5 py-2.5 text-right font-semibold ${preview.change.startsWith("+") ? "text-teal-700" : "text-clay"}`}>
                        {preview.change}
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
            EPC, Booked, Last referral and vs prev are sample preview values until those fields are computed from synced data.
          </p>
        </section>

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
              Needs Attention
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
                    <strong className="text-sm font-semibold">{/^Dr\.?\s/.test(name) ? maskedDoctorName(name) : name}</strong>
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
