"use client";

import Link from "next/link";
import fixture from "@/lib/ui/overview-fixtures.json";
import { link, panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, tagAlert, tagNew } from "./ui";

export function EpcPanel({ onPreview }: { onPreview: (label: string) => void }) {
  return (
    <section className={panel}>
      <Link href="/epc" className={panelHeaderLink}>
        <h2 className={panelHeaderTitle}>GPCCMP Patients</h2>
        <span className={panelHeaderArrow}>→</span>
      </Link>
      {fixture.epc.slice(0, 4).map((e) => (
        <div className="mx-5 flex items-center justify-between gap-3 border-b border-black/10 py-3 last:border-0" key={e.name}>
          <div className="min-w-0">
            <button className={link} onClick={() => onPreview(e.name)}>{e.name}</button>
            <small className="mt-0.5 block text-xs text-black/55">{e.used} of 5 used · expires {e.expires}</small>
          </div>
          <span className={e.kind === "alert" ? tagAlert : tagNew}>{e.kind === "alert" ? "Expiring" : `${e.used}/5 used`}</span>
        </div>
      ))}
    </section>
  );
}
