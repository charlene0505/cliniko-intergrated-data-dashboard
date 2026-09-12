"use client";

import Link from "next/link";
import type { ReferralStat } from "@/lib/models";
import { PeriodSelector } from "./period-selector";
import { link, panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, track } from "./ui";

type Doctor = { doctorId: string; displayName: string; count: number };

export function TopReferringDoctorsPanel({
  doctors,
  doctorsMax,
  doctorRange,
  onRangeChange,
  onPreviewCustomRange,
}: {
  doctors: ReferralStat["topReferrers"] | Doctor[] | null;
  doctorsMax: number;
  doctorRange: string;
  onRangeChange: (v: string) => void;
  onPreviewCustomRange: () => void;
}) {
  return (
    <section className={panel}>
      <Link href="/referrals" className={panelHeaderLink}>
        <h2 className={panelHeaderTitle}>Top referring doctors</h2>
        <span className={panelHeaderArrow}>→</span>
      </Link>
      <div className="flex flex-col gap-4 p-6">
        <PeriodSelector value={doctorRange} onChange={onRangeChange} onApplyCustomRange={onPreviewCustomRange} />
        <div className="flex flex-col gap-3">
          {doctors?.map((d) => {
            const match = d.displayName.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
            const name = match ? match[1] : d.displayName;
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
                  <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(d.count / doctorsMax) * 100}%` }} />
                </div>
              </div>
            );
          })}
          {!doctors && <p className="text-xs text-black/50">Loading real referral data…</p>}
        </div>
      </div>
    </section>
  );
}
