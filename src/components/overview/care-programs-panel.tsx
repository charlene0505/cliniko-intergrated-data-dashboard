"use client";

import Link from "next/link";
import fixture from "@/lib/ui/overview-fixtures.json";
import { down, link, panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, tagAlert, tagFlat, tagNew } from "./ui";

export function CareProgramsPanel({ onPreview }: { onPreview: (label: string) => void }) {
  return (
    <section className={`${panel} h-full`}>
      <Link href="/care-programs" className={panelHeaderLink}>
        <h2 className={panelHeaderTitle}>Case Management</h2>
        <span className={panelHeaderArrow}>→</span>
      </Link>
      <div className="min-h-0 overflow-y-auto">
        {fixture.epc.slice(0, 4).map((patient) => (
          <div className="mx-5 flex items-center justify-between gap-3 border-b border-black/10 py-3" key={`gpccmp-${patient.name}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button className={link} onClick={() => onPreview(patient.name)}>{patient.name}</button>
                <span className={tagNew}>GPCCMP</span>
              </div>
              <small className="mt-0.5 block text-xs text-black/55">{patient.used} of 5 used · expires {patient.expires}</small>
            </div>
            <span className={patient.kind === "alert" ? tagAlert : tagFlat}>{patient.kind === "alert" ? "Expiring" : `${patient.used}/5 used`}</span>
          </div>
        ))}
        {fixture.ahtr.slice(0, 4).map((patient, index) => (
          <div className={`mx-5 flex items-center justify-between gap-3 border-b border-black/10 py-3 ${index === 3 ? "border-b-0" : ""}`} key={`wc-ctp-${patient.name}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button className={link} onClick={() => onPreview(patient.name)}>{patient.name}</button>{" "}
                <span className={tagAlert}>WC/CTP</span>
              </div>
              <small className="mt-0.5 block text-xs text-black/55">{patient.scheme} · {patient.ahtr}</small>
            </div>
            <b className={down}>{patient.approved ? `${patient.approved - patient.used} left` : "Pending"}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
