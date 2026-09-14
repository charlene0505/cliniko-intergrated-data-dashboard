"use client";

import Link from "next/link";
import { useState } from "react";
import { Archivo } from "next/font/google";
import EpcPlans from "./epc-plans";
import AhtrRequests from "./ahtr-requests";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "800"] });

export default function CarePrograms() {
  const [tab, setTab] = useState<"GPCCMP" | "WC/CTP">("GPCCMP");
  const [error, setError] = useState("");

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setError("Unable to log out. Please try again.");
  }

  return (
    <main className={`min-h-screen text-[#1a1a1a] ${archivo.className}`}>
      <header className="border-b border-black/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-7 py-3.5">
          <span className="flex items-center gap-1.5 text-xs text-black/60">
            <span className="block h-1.5 w-1.5 rounded-full bg-teal-500" />
            Cliniko Integrated Smart Dashboard
          </span>
          <button type="button" onClick={logout} className="rounded-full border border-ink bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-teal-600 hover:bg-teal-600">Log out</button>
        </div>
        <div className="px-7 py-5">
          <Link className="mb-1.5 inline-block text-lg font-semibold text-teal-700 hover:text-teal-500" href="/">← Back</Link>
          <h1 className="text-3xl font-semibold tracking-tight">Case Management</h1>
          <div className="mt-4 flex gap-2" role="tablist" aria-label="Care program">
            {(["GPCCMP", "WC/CTP"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${tab === item ? "bg-ink text-white" : "border border-black/10 bg-white text-black/60 hover:text-black"}`}>{item}</button>
            ))}
          </div>
        </div>
      </header>
      <section role="tabpanel">{tab === "GPCCMP" ? <EpcPlans embedded /> : <AhtrRequests embedded />}</section>
      {error && <p role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-xs text-white">{error}</p>}
    </main>
  );
}
