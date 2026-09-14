"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEnterAnimation } from "@/lib/use-enter-animation";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useDataBlur } from "@/lib/data-blur";
import { fixtureBriefing } from "@/lib/today-briefing-curated";

interface NotePoint {
  text: string;
  risk: boolean;
}

interface PatientNoteItem {
  patientName: string;
  practitionerName: string;
  time: string;
  points: NotePoint[];
}

interface ReceptionNote {
  time: string;
  kind: "Message" | "To Do";
  text: string;
}

interface TodaySummary {
  patientNotes: PatientNoteItem[];
  receptionNotes: ReceptionNote[];
  trends: string[];
}

interface DayBriefing {
  date: string;
  businessName?: string;
  summary: TodaySummary;
  mocked?: boolean;
}

interface TodayBriefingResponse {
  status: "ok" | "not_scheduled" | "no_identity" | "error";
  date?: string;
  businessName?: string;
  summary?: TodaySummary;
  mocked?: boolean;
  nextShift?: DayBriefing;
}

// The same stored briefing the admin login gets from the server (today + next shift, re-dated to today).
function blurredBriefing(): TodayBriefingResponse {
  return fixtureBriefing();
}

function AddToTodoButton({
  patientName,
  pointText,
  alreadyAdded,
}: {
  patientName: string;
  pointText: string;
  alreadyAdded: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "adding" | "added">(alreadyAdded ? "added" : "idle");
  // Pre-filled content isn't today's actual data, so it mustn't be added to the real to-do list.
  const [blurred] = useDataBlur();

  async function handleAdd() {
    if (status !== "idle") return;
    setStatus("adding");
    try {
      const res = await fetch("/api/reception/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "task",
          text: `${patientName}: ${pointText}`,
          recipient: { type: "receptionist", id: "me" },
        }),
      });
      setStatus(res.ok ? "added" : "idle");
    } catch {
      setStatus("idle");
    }
  }

  if (blurred) return null;

  return (
    <span className="group/add relative inline-flex flex-none">
      <button
        type="button"
        onClick={handleAdd}
        disabled={status !== "idle"}
        aria-label="Add to to-do list"
        className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[11px] leading-none font-bold transition-all ${
          status === "added"
            ? "bg-teal-600 text-white opacity-100"
            : "bg-black/10 text-black/60 opacity-0 group-hover/point:opacity-100 hover:bg-black/20"
        }`}
      >
        {status === "added" ? "✓" : "+"}
      </button>
      {status === "idle" && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-40 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 text-center text-[10px] leading-tight font-medium whitespace-normal text-white opacity-0 transition-opacity group-hover/add:opacity-100">
          Add to to-do list
        </span>
      )}
    </span>
  );
}

function NoteRow({
  item,
  existingTaskTexts,
  visible,
  delayMs,
}: {
  item: PatientNoteItem;
  existingTaskTexts: Set<string>;
  visible: boolean;
  delayMs: number;
}) {
  return (
    <li
      className={`border-b px-2 border-black/10 pb-3 last:border-0 transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="flex justify-between items-center">
        <p className="flex text-base font-semibold tracking-tight">
          {item.patientName}
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-black/60">
            {item.practitionerName}
          </span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-black/60">
            {item.time}
          </span>
        </div>
      </div>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-snug">
        {item.points.map((p, i) => (
          <li key={i} className="group/point relative">
            <span className={p.risk ? "font-semibold text-clay" : "text-black/70"}>{p.text}</span>{" "}
            <AddToTodoButton
              patientName={item.patientName}
              pointText={p.text}
              alreadyAdded={existingTaskTexts.has(`${item.patientName}: ${p.text}`)}
            />
          </li>
        ))}
      </ul>
    </li>
  );
}

function ReceptionNoteRow({
  item,
  visible,
  delayMs,
}: {
  item: ReceptionNote;
  visible: boolean;
  delayMs: number;
}) {
  return (
    <li
      className={`border-b border-black/10 pb-3 last:border-0 transition-all duration-500 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-lg px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
            item.kind === "Message" ? "bg-white text-teal-700" : "bg-white text-clay"
          }`}
        >
          {item.kind}
        </span>
      </div>
      <p className="mt-2 text-xs leading-snug px-1 text-black/70">{item.text}</p>
    </li>
  );
}

// Decorative only — a deliberate pause before a briefing is revealed (2s for today's, 2s for the
// next-shift preview), not a real network wait. If today's briefing is genuinely still loading after
// that, the spinner simply stays up until it arrives. The ring itself orbits continuously (dot-orbit)
// so the dots visibly travel around the circle, while each dot also pulses bigger/smaller on its own
// staggered timer (dot-pulse) as it goes.
function BufferingSpinner({ label }: { label: string }) {
  const dots = Array.from({ length: 5 });
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <div className="animate-dot-orbit relative h-12 w-12">
        {dots.map((_, i) => {
          const angle = (i / dots.length) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + 42 * Math.cos(angle);
          const y = 50 + 42 * Math.sin(angle);
          return (
            <span
              key={i}
              className="animate-dot-pulse absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.15}s` }}
            />
          );
        })}
      </div>
      <p className="text-xs text-black/50">{label}</p>
    </div>
  );
}

// Every section/row fades and slides in on its own staggered delay off one `entered` flag, so the
// modal's content reads as appearing part by part rather than popping in all at once. `day` is a
// fresh object each time the parent re-renders it (new fetch, view switch, "Back") — which is
// exactly when we want this to replay, since that's when genuinely new content is on screen.
function DayBriefingSections({ day, existingTaskTexts }: { day: DayBriefing; existingTaskTexts: Set<string> }) {
  const entered = useEnterAnimation(day);
  const fade = (visible: boolean) =>
    `transition-all duration-500 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`;

  const STEP = 90;
  const subtitleDelay = 0;
  const receptionHeaderDelay = STEP;
  const patientHeaderDelay = day.summary.receptionNotes.length
    ? receptionHeaderDelay + STEP + day.summary.receptionNotes.length * 70
    : STEP;

  return (
    <>
      <p className={`text-xs -mt-3 text-black/50 ${fade(entered)}`} style={{ transitionDelay: `${subtitleDelay}ms` }}>
        {day.businessName} · {day.date}
      </p>

      {!!day.summary.receptionNotes.length && (
        <section className="bg-banner-light p-3 flex flex-col gap-2 rounded-2xl">
          <h4
            className={`text-base font-semibold text-black ${fade(entered)}`}
            style={{ transitionDelay: `${receptionHeaderDelay}ms` }}
          >
            Messages/To-dos
          </h4>
          <ul className=" flex flex-col gap-3">
            {day.summary.receptionNotes.map((item, i) => (
              <ReceptionNoteRow key={i} item={item} visible={entered} delayMs={receptionHeaderDelay + (i + 1) * 70} />
            ))}
          </ul>
        </section>
      )}

      {!!day.summary.patientNotes.length && (
        <section>
          <h4
            className={`text-base bg-surface-muted p-1 px-2 rounded-md font-semibold text-black ${fade(entered)}`}
            style={{ transitionDelay: `${patientHeaderDelay}ms` }}
          >
            Patient notes
          </h4>
          <ul className="mt-4 flex flex-col gap-3">
            {day.summary.patientNotes.map((item, i) => (
              <NoteRow
                key={i}
                item={item}
                existingTaskTexts={existingTaskTexts}
                visible={entered}
                delayMs={patientHeaderDelay + (i + 1) * 80}
              />
            ))}
          </ul>
        </section>
      )}

      {/* {!!day.summary.trends.length && (
        <section className=" bg-surface-muted rounded-2xl p-2  items-center justify-center">
          <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-snug justify-center items-center ">
            {day.summary.trends.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )} */}

      {/* {day.mocked && (
        <p className="text-[10px] text-black/40">
          Preview summary — not generated by a live AI call yet.
        </p>
      )} */}
    </>
  );
}

// A rule-based preview of "what's going on today" — not a live AI call (see the `mocked` flag and
// caption below), just the shape of the feature over real appointment/note data.
export function TodayBriefingButton({ onClose, existingTaskTexts }: { onClose?: () => void; existingTaskTexts?: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TodayBriefingResponse | null>(null);
  const [view, setView] = useState<"current" | "next">("current");
  const [buffering, setBuffering] = useState(false);
  const [blurred] = useDataBlur();
  // The page behind stays put while the popup is open; only the popup's own content scrolls.
  useScrollLock(open);
  // Bumped on every open, so a response from an earlier open — e.g. a slow real briefing that lands
  // after data blur was switched on — can't overwrite what's on screen now.
  const requestId = useRef(0);

  function openModal() {
    const id = ++requestId.current;
    setOpen(true);
    setView("current");
    // A deliberate 2s "analyzing" pause before today's briefing is revealed, on every open. Tied to this
    // open's id, so closing and reopening mid-pause can't end the new open's pause early.
    setBuffering(true);
    setTimeout(() => {
      if (id === requestId.current) setBuffering(false);
    }, 2000);
    // With data blur on, the server is never queried: the pre-filled curated briefing is shown instead.
    if (blurred) {
      setData(blurredBriefing());
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/reception/today-briefing")
      .then((res) => res.json())
      .then((d: TodayBriefingResponse) => {
        if (id === requestId.current) setData(d);
      })
      .catch(() => {
        if (id === requestId.current) setData({ status: "error" });
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }

  // Any "+" clicked inside creates a task straight in the database — the parent's to-do list
  // doesn't know about it until it refetches, so closing the modal is what triggers that (rather
  // than trying to keep two separate task lists in sync while it's open).
  function closeModal() {
    setOpen(false);
    onClose?.();
  }

  // The next shift's data is already fetched alongside today's — this delay is purely so the
  // switch feels like it's pulling up something new rather than an instant, jarring swap.
  function showNextShift() {
    setView("next");
    setBuffering(true);
    setTimeout(() => setBuffering(false), 2000);
  }

  return (
    <>
      <div className="inline-block w-auto animate-shimmer rounded-full bg-[length:200%_200%] bg-gradient-to-r from-banner-semiLight via-clay-light to-banner p-[1.5px] shadow-[0_0_10px_rgba(20,163,168,0.25)] transition-shadow hover:shadow-[0_0_16px_rgba(20,163,168,0.4)]">
        <button
          type="button"
          onClick={openModal}
          className="group flex w-auto items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink transition-colors hover:cursor-pointer hover:bg-black/5 hover:text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-3.5 w-3.5 text-black transition-colors group-hover:text-white"
          >
            <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
            <path d="M19 14.5l.9 2.6L22.5 18l-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
          </svg>
          What&apos;s going on today?
        </button>
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            // Portalled to document.body, so it sits outside the <main> that sets the page's text
            // colour — without an explicit colour it inherits body's, which is near-white under a
            // dark colour scheme and disappears against the card.
            className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-2xl bg-white p-8 text-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                Today&apos;s briefing
                {blurred && (
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-black/55">
                    Pre-filled
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-black/50 hover:text-black"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Stays up for the 2s pause and for however long the briefing actually takes beyond it. */}
            {view === "current" && (loading || buffering) && <BufferingSpinner label="Analyzing today's shift…" />}

            {!(loading || buffering) && data?.status === "no_identity" && (
              <p className="text-xs text-black/50">
                This login isn&apos;t linked to a receptionist yet.
              </p>
            )}
            {!(loading || buffering) && data?.status === "error" && (
              <p className="text-xs text-black/50">
                Unable to load today&apos;s briefing.
              </p>
            )}

            {!(loading || buffering) && view === "current" && data?.status === "not_scheduled" && (
              <p className="text-xs text-black/50">Not rostered at any practice today</p>
            )}
            {!(loading || buffering) && view === "current" && data?.status === "ok" && data.summary && (
              <DayBriefingSections
                day={{ date: data.date ?? "", businessName: data.businessName, summary: data.summary, mocked: data.mocked }}
                existingTaskTexts={existingTaskTexts ?? new Set()}
              />
            )}
            {/* The next-shift preview is only offered when there's no briefing for today — with today's
                shift on screen, it's hidden entirely (the admin login's stored response still carries one). */}
            {!(loading || buffering) && view === "current" && data?.status !== "ok" && data?.nextShift && (
              <div className="inline-block w-auto self-start animate-shimmer rounded-full bg-[length:200%_200%] bg-gradient-to-r from-banner-semiLight via-clay-light to-banner p-[1.5px] shadow-[0_0_10px_rgba(20,163,168,0.25)] transition-shadow hover:shadow-[0_0_16px_rgba(20,163,168,0.4)]">
                <button
                  type="button"
                  onClick={showNextShift}
                  className="group flex w-auto items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink transition-colors hover:cursor-pointer hover:bg-black/5 hover:text-white"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-3.5 w-3.5 text-black transition-colors group-hover:text-white"
                  >
                    <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
                    <path d="M19 14.5l.9 2.6L22.5 18l-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
                  </svg>
                Next shift preview →
                </button>
              </div>
            )}

            {!loading && view === "next" && (
              <>
                {buffering ? (
                  <BufferingSpinner label="Analyzing next shift…" />
                ) : (
                  data?.nextShift && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-semibold text-black">Next shift preview</h4>
                        {/* <button
                          type="button"
                          onClick={() => setView("current")}
                          className="text-xs font-semibold text-black/50 hover:text-black"
                        >
                          ← Back
                        </button> */}
                      </div>
                      <DayBriefingSections day={data.nextShift} existingTaskTexts={existingTaskTexts ?? new Set()} />
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
