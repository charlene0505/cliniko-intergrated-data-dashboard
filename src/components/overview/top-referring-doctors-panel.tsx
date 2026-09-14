"use client";

import Link from "next/link";
import type { ReferralStat } from "@/lib/models";
import type { Period } from "@/lib/date-range";
import { PeriodSelector } from "./period-selector";
import { useEnterAnimation } from "@/lib/use-enter-animation";
import { maskedDoctorName } from "@/lib/display-name";
import { link, panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, track } from "./ui";

type Doctor = { doctorId: string; displayName: string; count: number };

export function TopReferringDoctorsPanel({
  doctors,
  doctorsMax,
  doctorRange,
  onRangeChange,
}: {
  doctors: ReferralStat["topReferrers"] | Doctor[] | null;
  doctorsMax: number;
  doctorRange: Period;
  onRangeChange: (v: Period) => void;
}) {
  // Replays whenever a range switch brings in a new list. The width transition is only applied while
  // entered, so the reset to zero snaps instantly and just the grow-in animates — with it always on,
  // the reset itself animated and was overridden two frames later, which read as a small shift.
  const entered = useEnterAnimation(doctors);

  return (
    <section className={`${panel} h-full`}>
      <Link href="/referrals" className={panelHeaderLink}>
        <h2 className={panelHeaderTitle}>Top referring doctors</h2>
        <span className={panelHeaderArrow}>→</span>
      </Link>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
        <PeriodSelector value={doctorRange} onChange={onRangeChange} />
        <div className="flex flex-col gap-3">
          {doctors?.map((d, i) => {
            const match = d.displayName.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
            const name = maskedDoctorName(match ? match[1] : d.displayName);
            const practiceName = match ? match[2] : "";
            return (
              <div className="flex flex-col gap-1.5" key={d.doctorId}>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="min-w-0 truncate">
                    <Link href="/referrals" className={link}>{name}</Link>
                    {practiceName && <small className="text-xs text-black/50"> · {practiceName}</small>}
                  </span>
                  <strong className="text-sm font-extrabold tabular-nums">{d.count}</strong>
                </div>
                <div className={track}>
                  <div
                    className={`h-2 rounded-full bg-teal-500 ${entered ? "transition-[width] duration-1000 ease-out" : ""}`}
                    style={{ width: entered ? `${(d.count / doctorsMax) * 100}%` : "0%", transitionDelay: `${i * 60}ms` }}
                  />
                </div>
              </div>
            );
          })}
          {doctors?.length === 0 && <p className="text-xs text-black/50">No referrals in this period.</p>}
          {!doctors && <p className="text-xs text-black/50">Loading real referral data…</p>}
        </div>
      </div>
    </section>
  );
}
