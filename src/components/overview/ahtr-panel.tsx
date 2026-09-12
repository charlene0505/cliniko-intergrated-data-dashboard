"use client";

import Link from "next/link";
import fixture from "@/lib/ui/overview-fixtures.json";
import { down, link, panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, tagFlat } from "./ui";

export function AhtrPanel({ onPreview }: { onPreview: (label: string) => void }) {
  return (
    <section className={panel}>
      <Link href="/ahtr" className={panelHeaderLink}>
        <h2 className={panelHeaderTitle}>WC/CTP Patients</h2>
        <span className={panelHeaderArrow}>→</span>
      </Link>
      {fixture.ahtr.slice(0, 4).map((a) => (
        <div
          className="mx-5 flex items-center justify-between gap-3 border-b border-black/10 py-3 last:border-0"
          key={a.name}
        >
          <div className="min-w-0">
            <button className={link} onClick={() => onPreview(a.name)}>
              {a.name}
            </button>{" "}
            <span className={tagFlat}>{a.scheme}</span>
            <small className="mt-0.5 block text-xs text-black/55">
              {a.ahtr}
            </small>
          </div>
          <b className={down}>
            {a.approved ? `${a.approved - a.used} left` : "Pending"}
          </b>
        </div>
      ))}
    </section>
  );
}
