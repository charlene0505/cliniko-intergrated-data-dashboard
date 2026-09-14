"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { ReceptionMessage, Receptionist } from "@/lib/models";
import { displayName } from "@/lib/display-name";
import { Segments } from "./segments";
import { TodayBriefingButton } from "./today-briefing-modal";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, tagAlert, tagFlat } from "./ui";

type Practitioner = { _id: string; name: string };
type Recipient = { type: "receptionist" | "practitioner"; id: string };

export function ReceptionTodoPanel({
  tasks,
  receptionists,
  practitioners,
  currentUser,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  onBriefingClose,
}: {
  tasks: ReceptionMessage[] | null;
  receptionists: Receptionist[];
  practitioners: Practitioner[];
  currentUser: string | null;
  onToggle: (id: string, completed: boolean) => void;
  onCreate: (input: { text: string; recipient: Recipient; priority: "High" | "Routine" }) => void;
  onUpdate: (id: string, input: { text: string; recipient: Recipient; priority: "High" | "Routine" }) => void;
  onDelete: (id: string) => void;
  onBriefingClose: () => void;
}) {
  const [composing, setComposing] = useState(false);
  // Which task the modal is editing, or null when it's composing a new one — the same form serves
  // both, just prefilled and submitted differently.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The task awaiting delete confirmation — deleting is irreversible, so it goes through a
  // confirm step rather than firing straight off the row's button.
  const [pendingDelete, setPendingDelete] = useState<ReceptionMessage | null>(null);
  const [text, setText] = useState("");
  const [recipientKey, setRecipientKey] = useState("");
  const [priority, setPriority] = useState<"High" | "Routine">("Routine");
  const [view, setView] = useState<"My Tasks" | "Assigned to others">(
    "My Tasks",
  );
  // The page behind stays put while the compose/edit or delete-confirm popup is open.
  useScrollLock(composing || !!pendingDelete);

  // "Received" = tasks addressed to a receptionist (what we need to do). "Assigned to others" =
  // tasks addressed to a practitioner (what we've handed off, kept here only to track). A task
  // addressed to someone else never belongs in the "received" bucket, so this split — not just a
  // recipientType filter on the fetch — is what keeps a task like "To Duncan Lai" out of it even
  // if it arrives in the same list as everything else.
  const filtered = (tasks ?? []).filter((t) =>
    view === "My Tasks"
      ? t.recipient.type === "receptionist"
      : t.recipient.type === "practitioner",
  );

  // Lets the briefing modal know which "+ add to to-do" bullets already have a matching task, so
  // reopening it shows them as already-added instead of resetting to "+" every time.
  const existingTaskTexts = new Set((tasks ?? []).map((t) => t.text));

  // Completed tasks stay in the list, crossed out, sunk to the bottom — clicking one again is how
  // you undo it, so there's no separate bulk "reset" control. The list isn't truncated: the panel
  // scrolls (overflow-y-auto below), so a task sinking to the bottom never gets cut off.
  const sorted = [...filtered].sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt));

  function recipientName(t: ReceptionMessage): string {
    if (t.recipient.type === "receptionist") return receptionists.find((r) => r._id === t.recipient.id)?.name ?? "Receptionist";
    return practitioners.find((p) => p._id === t.recipient.id)?.name ?? "Practitioner";
  }

  function openCreate() {
    setEditingId(null);
    setText("");
    setRecipientKey("");
    setPriority("Routine");
    setComposing(true);
  }

  function openEdit(task: ReceptionMessage) {
    setEditingId(task._id);
    setText(task.text);
    setRecipientKey(`${task.recipient.type}:${task.recipient.id}`);
    setPriority(task.priority ?? "Routine");
    setComposing(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const [type, id] = recipientKey.split(":") as [Recipient["type"] | undefined, string | undefined];
    if (!text.trim() || !type || !id) return;
    const input = { text: text.trim(), recipient: { type, id }, priority };
    if (editingId) onUpdate(editingId, input);
    else onCreate(input);
    setText("");
    setRecipientKey("");
    setPriority("Routine");
    setEditingId(null);
    setComposing(false);
  }

  return (
    <section className={`${panel} h-115`}>
      <Link href="/todos" className={`${panelHeaderLink} group`}>
        <h2 className={panelHeaderTitle}>To Do List</h2>
        <span className={panelHeaderArrow}>→</span>
      </Link>

      <div className="flex items-center justify-between gap-3 px-6 pt-3">
        <Segments
          options={["My Tasks", "Assigned to others"]}
          value={view}
          onChange={(v) => setView(v as typeof view)}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-alert hover:text-clay hover:cursor-pointer"
          >
            + Add Task
          </button>
        </div>
      </div>

      {composing && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setComposing(false)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-8 text-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold tracking-tight">
                {editingId ? "Edit task" : "Add task"}
              </h3>
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="text-black/50 hover:text-black"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <textarea
                required
                autoFocus
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Task or message…"
                className="resize-none rounded-md border border-black/10 px-2 py-1.5 text-sm focus:outline focus:outline-black/30"
              />
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <select
                  required
                  value={recipientKey}
                  onChange={(e) => setRecipientKey(e.target.value)}
                  className="rounded-md border border-black/10 px-2 py-1 text-xs"
                >
                  <option value="" disabled>
                    To…
                  </option>
                  {receptionists.map((r) => (
                    <option key={r._id} value={`receptionist:${r._id}`}>
                      {r.name}
                    </option>
                  ))}
                  {practitioners.map((p) => (
                    <option key={p._id} value={`practitioner:${p._id}`}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as "High" | "Routine")
                  }
                  className="rounded-md border border-black/10 px-2 py-1 text-xs"
                >
                  <option value="Routine">Routine</option>
                  <option value="High">High</option>
                </select>
                <button
                  type="submit"
                  className="rounded-md bg-ink px-3 py-1 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-teal-600"
                >
                  {editingId ? "Save" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {pendingDelete && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-8 text-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold tracking-tight">Delete this task?</h3>
            <p className="rounded-md bg-black/5 px-3 py-2 text-sm leading-snug text-black/70">
              {pendingDelete.text}
            </p>
            <p className="text-xs text-black/55">This can&apos;t be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-md px-3 py-1 text-xs font-semibold text-black/60 transition-colors hover:text-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(pendingDelete._id);
                  setPendingDelete(null);
                }}
                className="rounded-md bg-black px-3 py-1 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-black/70"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="flex-1 overflow-y-auto">
        {tasks === null && (
          <p className="px-6 py-4 text-xs text-black/50">Loading tasks…</p>
        )}
        {tasks !== null && filtered.length === 0 && (
          <p className="px-6 py-4 text-xs text-black/50">
            {view === "My Tasks"
              ? "No open tasks."
              : "Nothing assigned out to others yet."}
          </p>
        )}
        {sorted.map((t) => {
          const isDone = !!t.completedAt;
          return (
            <div
              className={`mx-6 flex items-start gap-3 border-b border-black/10 py-3.5 last:border-0 ${isDone ? "opacity-50" : ""}`}
              key={t._id}
            >
              <input
                type="checkbox"
                aria-label={`${isDone ? "Reopen" : "Complete"} ${t.text}`}
                checked={isDone}
                onChange={() => onToggle(t._id, !isDone)}
                className="mt-0.5 h-4.5 w-4.5 flex-none cursor-pointer accent-[#14a3a8]"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm leading-snug ${isDone ? "line-through" : ""}`}
                >
                  {t.text}
                </p>
                <small className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-black/55">
                  <span>To {recipientName(t)}</span>
                  <span>· From {displayName(t.senderName)}</span>
                  {/* Only the sender can edit a task — the API enforces the same rule, this just
                      keeps the control off rows where it would fail. */}
                  {t.senderName === currentUser && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="px-1 rounded-md cursor-pointer border-0 p-0 font-semibold text-white bg-teal-500 hover:bg-teal-900"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(t)}
                        className="px-1 rounded-md cursor-pointer border-0 p-0 font-semibold text-white bg-black hover:bg-black/70"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </small>
              </div>
              <span className={t.priority === "High" ? tagAlert : tagFlat}>
                {t.priority ?? "Routine"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="p-4">
        <TodayBriefingButton
          onClose={onBriefingClose}
          existingTaskTexts={existingTaskTexts}
        />
      </div>
    </section>
  );
}
