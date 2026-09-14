"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archivo } from "next/font/google";
import fixture from "@/lib/ui/overview-fixtures.json";
import { useScrollLock } from "@/lib/use-scroll-lock";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
});

const kpis = [
  ["Active GPCCMP plans", "61", ""],
  ["no next appt", "14", ""],
  ["Referrals expiring ≤30d", "4", ""],
  ["Avg sessions used", "3.2", ""],
] as const;

const card = "min-w-0 rounded-[20px] border border-black/10 bg-white p-6";
const link =
  "cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#0b7276] hover:text-[#14a3a8]";

interface ContactEntry {
  note: string;
  createdAt: string;
  type: "careplan" | "payment" | "clinical";
}

export default function EpcPlans({ embedded = false }: { embedded?: boolean }) {
  const [notice, setNotice] = useState("");
  const preview = (label: string) =>
    setNotice(`${label} · This action isn't connected yet.`);

  const [contactNotes, setContactNotes] = useState<Record<string, ContactEntry[]>>({});
  const [contactModalFor, setContactModalFor] = useState<{ name: string; email: string } | null>(null);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [saving, setSaving] = useState(false);
  // The page behind stays put while the contact-notes popup is open.
  useScrollLock(!!contactModalFor);

  useEffect(() => {
    const query = fixture.epc.map((patient) => `email=${encodeURIComponent(patient.email)}`).join("&");
    fetch(`/api/patients/contact-history?${query}&type=careplan`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => setContactNotes(data.histories))
      .catch(() => setNotice("Unable to load contact history."));
  }, []);

  function openContactModal(patient: { name: string; email: string }, entry?: ContactEntry) {
    setDraftNote(entry?.note ?? "");
    setEditingCreatedAt(entry?.createdAt ?? null);
    setContactModalFor(patient);
  }

  function closeContactModal() {
    setContactModalFor(null);
  }

  async function saveContactNotes() {
    if (!contactModalFor) return;
    const note = draftNote.trim();
    if (!note) return;
    setSaving(true);
    const method = editingCreatedAt ? "PATCH" : "POST";
    const response = await fetch("/api/patients/contact-history", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: contactModalFor.email, note, type: "careplan", createdAt: editingCreatedAt }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setNotice(data.error ?? "Unable to save contact history.");
    setContactNotes((previous) => {
      const entries = previous[contactModalFor.email] ?? [];
      return {
        ...previous,
        [contactModalFor.email]: editingCreatedAt
          ? entries.map((entry) => entry.createdAt === editingCreatedAt ? data.entry : entry)
          : [...entries, data.entry],
      };
    });
    closeContactModal();
  }

  async function deleteContactNote(email: string, createdAt: string) {
    const response = await fetch("/api/patients/contact-history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, createdAt }),
    });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error ?? "Unable to delete contact history.");
    setContactNotes((previous) => ({
      ...previous,
      [email]: (previous[email] ?? []).filter((entry) => entry.createdAt !== createdAt),
    }));
  }
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setNotice("Unable to log out. Please try again.");
  }

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
          <h1 className="text-3xl font-semibold tracking-tight">
            GPCCMP Patients Management
          </h1>
        </div>
      </header>}
      <div className="flex flex-col gap-5 px-7 pb-10 pt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map(([kLabel, value, note]) => (
            <article
              key={kLabel}
              className="flex min-w-0 flex-col gap-1.5 rounded-[18px] border bg-surface-muted border-black/10  p-5"
            >
              <div className="text-[10.5px] font-semibold tracking-widest text-black/55">
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
                    "Contact Notes",
                  ].map((title) => (
                    <th
                      key={title}
                      className={` px-2.5 py-2 text-left text-base font-semibold text-black/55 whitespace-nowrap bg-banner-light justify-center items-center ${title === "Action" ? "text-right" : ""}`}
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
                    {/* <td className="border-b border-black/10 px-2.5 py-3 text-xs text-black/60">
                      {e.note}
                    </td> */}
                    <td className="max-w-[200px] border-b border-black/10 px-2.5 py-3">
                      {(contactNotes[e.email]?.length ?? 0) > 0 ? (
                        <div className="flex flex-col gap-1">
                          <p className="truncate text-xs text-black/70">
                            {contactNotes[e.email].at(-1)?.note}
                          </p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openContactModal(e, contactNotes[e.email].at(-1))} className={`${link} text-xs`}>Edit</button>
                            <button onClick={() => deleteContactNote(e.email, contactNotes[e.email].at(-1)!.createdAt)} className="text-xs font-semibold text-clay hover:text-black">Delete</button>
                            <button onClick={() => openContactModal(e)} className={`${link} text-xs`}>+ Add</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => openContactModal(e)}
                          className="rounded-full border border-[#14a3a8] bg-[#14a3a8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0e8a8f]"
                        >
                          + Add note
                        </button>
                      )}
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
      {contactModalFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeContactModal}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold tracking-tight">
                {editingCreatedAt ? "Edit" : "Add"} contact note · {contactModalFor.name}
              </h3>
              <button
                type="button"
                onClick={closeContactModal}
                className="text-black/50 hover:text-black"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-black/60">
              <textarea
                rows={3}
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="What was discussed when you contacted this patient…"
                className="rounded-xl border border-black/10 p-2.5 text-sm font-normal text-black focus:outline focus:outline-teal-600"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeContactModal}
                className="rounded-full px-4 py-1.5 text-xs font-semibold text-black/60 hover:text-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveContactNotes}
                disabled={saving || !draftNote.trim()}
                className="rounded-full border border-[#14a3a8] bg-[#14a3a8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0e8a8f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
