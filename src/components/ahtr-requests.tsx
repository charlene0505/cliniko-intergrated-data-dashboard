"use client";

import Link from "next/link";
import { useState } from "react";
import { Archivo } from "next/font/google";
import fixture from "@/lib/ui/overview-fixtures.json";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
});

const kpis = [
  ["Active WC claims", "14"],
  ["Active CTP claims", "11"],
  ["AHTR pending", "2"],
  ["2 or fewer sessions left", "5"],
] as const;

const card = "min-w-0 rounded-[20px] border border-black/10 bg-white p-6";
const link =
  "cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#0b7276] hover:text-[#14a3a8]";
const tagBase =
  "inline-block rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap";
const tagAlert = `${tagBase} bg-[#fbe8dc] text-[#a3561f]`;
const tagDue = `${tagBase} bg-[#e3f4f5] text-[#0b7276]`;
const tagFlat = `${tagBase} bg-[#f1efe9] text-black/70`;
const track = "h-1.5 overflow-hidden rounded-full bg-[#e6e3dc]";

function tagFor(kind: string) {
  return kind === "alert" ? tagAlert : kind === "due" ? tagDue : tagFlat;
}

export default function AhtrRequests({ embedded = false }: { embedded?: boolean }) {
  const [notice, setNotice] = useState("");
  const preview = (label: string) =>
    setNotice(`${label} · This action isn't connected yet.`);
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setNotice("Unable to log out. Please try again.");
  }

  const rows = fixture.ahtr.map((a) => {
    const left = a.approved - a.used;
    return {
      ...a,
      left,
      leftLabel:
        a.approved === 0
          ? "Awaiting approval"
          : `${left} of ${a.approved} left`,
      barW:
        a.approved === 0
          ? "0%"
          : `${((a.used / a.approved) * 100).toFixed(1)}%`,
      barC: left === 0 ? "#a3561f" : left <= 2 ? "#d2762f" : "#14a3a8",
    };
  });

  return (
    <div className={`${embedded ? "" : "min-h-screen"} text-[#1a1a1a] ${archivo.className}`}>
      {!embedded && <header className="border-b border-black/10 bg-white">
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
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest text-black/50">
            AHTR tracking
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            WorkCover and CTP treatment requests
          </h1>
        </div>
      </header>}
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 ">
          {kpis.map(([kLabel, value]) => (
            <article
              key={kLabel}
              className="flex min-w-0 flex-col bg-surface-muted gap-2.5 rounded-[18px] border border-black/10 p-5"
            >
              <div className="text-[10.5px] font-semibold uppercase tracking-widest text-black/55">
                {kLabel}
              </div>
              <div className="text-3xl font-semibold tracking-tight">
                {value}
              </div>
            </article>
          ))}
        </div>

        <section className={`${card} pb-3`}>
          <h2 className="mb-1.5 text-base font-semibold tracking-tight">
            WorkCover and CTP patients
          </h2>
          <p className="mb-3.5 text-xs text-black/60">
            Latest Allied Health Treatment Request and sessions remaining
            against it. Sorted by urgency.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    "Patient",
                    "Scheme",
                    "Claim",
                    "Latest AHTR",
                    "Sessions left",
                    "Next appt",
                    "Action",
                  ].map((title) => (
                    <th
                      key={title}
                      className={`border-b border-black/10 px-2.5 pb-2 text-left text-[10.5px] font-semibold uppercase tracking-widest text-black/55 whitespace-nowrap ${title === "Action" ? "text-right" : ""}`}
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.name}>
                    <td className="border-b border-black/10 px-2.5 py-3">
                      <button className={link} onClick={() => preview(a.name)}>
                        {a.name}
                      </button>
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3">
                      <span className={a.scheme === "WC" ? tagDue : tagFlat}>
                        {a.scheme}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-b border-black/10 px-2.5 py-3 tabular-nums text-black/65">
                      {a.claim}
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3">
                      <span className={tagFor(a.kind)}>{a.ahtr}</span>
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span
                          className="text-xs font-extrabold"
                          style={{ color: a.barC }}
                        >
                          {a.leftLabel}
                        </span>
                        <div className={track}>
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: a.barW, background: a.barC }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-black/10 px-2.5 py-3 text-black/70">
                      {a.next}
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3 text-right">
                      <button
                        onClick={() => preview(`Request AHTR for ${a.name}`)}
                        className="rounded-full border border-[#14a3a8] bg-[#14a3a8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0e8a8f]"
                      >
                        Request
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
    </div>
  );
}
