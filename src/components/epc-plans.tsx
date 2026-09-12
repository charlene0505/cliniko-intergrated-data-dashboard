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
  ["Active GPCCMP plans", "61", ""],
  ["no next appt", "14", ""],
  ["Referrals expiring ≤30d", "4", "Sessions will be forfeited"],
  ["Avg sessions used", "3.2", "Out of 5 allowed"],
] as const;

const card = "min-w-0 rounded-[20px] border border-black/10 bg-white p-6";
const link =
  "cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#0b7276] hover:text-[#14a3a8]";

export default function EpcPlans() {
  const [notice, setNotice] = useState("");
  const preview = (label: string) =>
    setNotice(`${label} · This action isn't connected yet.`);
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
            Cliniko
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
            className="mb-1.5 inline-block text-xs font-semibold text-[#0b7276] hover:text-[#14a3a8]"
            href="/"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            GPCCMP Patients Management
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
              <div className="text-3xl font-semibold tracking-tight">
                {value}
              </div>
              <p className="text-xs text-black/55">{note}</p>
            </article>
          ))}
        </div>

        <section className={`${card} pb-3`}>
          <h2 className="mb-1.5 text-base font-semibold tracking-tight">
            EPC plans with sessions left and no next appointment
          </h2>
          <p className="mb-3.5 text-xs text-black/60">
            Sorted by referral expiry — soonest first. Each plan allows five
            sessions per calendar year.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    "Patient",
                    "Phone",
                    "Email",
                    "Practitioner",
                    "Last visit",
                    "Sessions used",
                    "Notes",
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
                {fixture.epc.map((e) => (
                  <tr key={e.name}>
                    <td className="border-b border-black/10 px-2.5 py-3">
                      <button className={link} onClick={() => preview(e.name)}>
                        {e.name}
                      </button>
                    </td>
                    <td className="whitespace-nowrap border-b border-black/10 px-2.5 py-3 tabular-nums text-black/70">
                      {e.phone}
                    </td>
                    <td className="max-w-[180px] truncate border-b border-black/10 px-2.5 py-3 text-black/70">
                      {e.email}
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3 text-black/70">
                      {e.clinician}
                    </td>
                    <td className="whitespace-nowrap border-b border-black/10 px-2.5 py-3 text-black/70">
                      {e.lastVisit}
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <span
                              key={i}
                              className={`block h-2 w-4 rounded-full ${i < e.used ? "bg-[#14a3a8]" : "bg-[#e4e1da]"}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-semibold text-black/70">
                          {e.used}/5
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3 text-xs text-black/60">
                      {e.note}
                    </td>
                    <td className="border-b border-black/10 px-2.5 py-3 text-right">
                      <button
                        onClick={() => preview(`Book ${e.name}`)}
                        className="rounded-full border border-[#14a3a8] bg-[#14a3a8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0e8a8f]"
                      >
                        Book
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
    </main>
  );
}
