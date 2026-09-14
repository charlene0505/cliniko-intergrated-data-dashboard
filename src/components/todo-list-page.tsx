"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archivo } from "next/font/google";
import { displayName } from "@/lib/display-name";
import type { ReceptionMessage, Receptionist } from "@/lib/models";
import { useScrollLock } from "@/lib/use-scroll-lock";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "800"] });
type Practitioner = { _id: string; name: string };
type Recipient = { type: "receptionist" | "practitioner"; id: string };
type Filter = "All" | "Open" | "Completed";

export default function TodoListPage({ currentUser }: { currentUser: string | null }) {
  const [tasks, setTasks] = useState<ReceptionMessage[]>([]);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [editing, setEditing] = useState<ReceptionMessage | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [recipientKey, setRecipientKey] = useState("");
  const [priority, setPriority] = useState<"High" | "Routine">("Routine");
  const [notice, setNotice] = useState("");
  // The page behind stays put while the task popup is open.
  useScrollLock(editing !== undefined);

  const load = useCallback(async () => {
    try {
      const [taskResponse, receptionistResponse, practitionerResponse] = await Promise.all([
        fetch("/api/reception/messages?kind=task"),
        fetch("/api/reception/receptionists"),
        fetch("/api/reception/practitioners"),
      ]);
      const [taskData, receptionistData, practitionerData] = await Promise.all([
        taskResponse.json(), receptionistResponse.json(), practitionerResponse.json(),
      ]);
      setTasks(taskData.messages ?? []);
      setReceptionists(receptionistData.receptionists ?? []);
      setPractitioners(practitionerData.practitioners ?? []);
    } catch {
      setNotice("Unable to load the to-do list.");
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const openCount = tasks.filter((task) => !task.completedAt).length;
  const completedCount = tasks.length - openCount;
  const visible = tasks.filter((task) => filter === "All" || (filter === "Open" ? !task.completedAt : !!task.completedAt));
  const groups = useMemo(() => [
    { label: "Reception tasks", tasks: visible.filter((task) => !task.completedAt && task.recipient.type === "receptionist") },
    { label: "Assigned to practitioners", tasks: visible.filter((task) => !task.completedAt && task.recipient.type === "practitioner") },
    { label: "Completed", tasks: visible.filter((task) => !!task.completedAt) },
  ].filter((group) => group.tasks.length || filter === "All"), [visible, filter]);

  function recipientName(task: ReceptionMessage) {
    return task.recipient.type === "receptionist"
      ? receptionists.find((person) => person._id === task.recipient.id)?.name ?? "Receptionist"
      : practitioners.find((person) => person._id === task.recipient.id)?.name ?? "Practitioner";
  }

  function openForm(task: ReceptionMessage | null) {
    setEditing(task);
    setText(task?.text ?? "");
    setRecipientKey(task ? `${task.recipient.type}:${task.recipient.id}` : "");
    setPriority(task?.priority ?? "Routine");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const [type, id] = recipientKey.split(":") as [Recipient["type"], string];
    if (!text.trim() || !type || !id) return;
    const response = await fetch(editing ? `/api/reception/messages/${editing._id}` : "/api/reception/messages", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(!editing && { kind: "task" }), text: text.trim(), recipient: { type, id }, priority }),
    });
    if (!response.ok) {
      const data = await response.json();
      return setNotice(data.error ?? "Unable to save the task.");
    }
    setEditing(undefined);
    await load();
  }

  async function toggle(task: ReceptionMessage) {
    await fetch(`/api/reception/messages/${task._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !task.completedAt }) });
    await load();
  }

  async function remove(task: ReceptionMessage) {
    if (!window.confirm(`Delete “${task.text}”? This cannot be undone.`)) return;
    const response = await fetch(`/api/reception/messages/${task._id}`, { method: "DELETE" });
    if (!response.ok) return setNotice("Unable to delete the task.");
    await load();
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
  }

  return (
    <main
      className={`min-h-screen bg-neutral-50 text-ink ${archivo.className}`}
    >
      <header className="border-b border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-7 py-3.5 text-xs text-black/60">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            Cliniko Integrated Smart Dashboard
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-600"
          >
            Log out
          </button>
        </div>
        <div className="px-7 py-5">
          <Link
            href="/"
            className="mb-1.5 inline-block text-lg font-semibold text-teal-700 hover:text-teal-500"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            Reception to-do
          </h1>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-7 py-6">
        <div className="flex gap-2 justify-between">
          <div className="flex gap-2">
            {(["All", "Open", "Completed"] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${filter === option ? "bg-ink text-white" : "border border-black/10 bg-white text-black/60"}`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center">
            <button
              type="button"
              onClick={() => openForm(null)}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
            >
              New task
            </button>
          </div>
        </div>

        {groups.map((group) => (
          <section
            key={group.label}
            className="overflow-hidden rounded-[20px] border border-black/10 bg-white"
          >
            <div className="flex items-baseline justify-between border-b border-black/10 px-5 py-3.5">
              <h2 className="text-xs font-extrabold uppercase tracking-widest">
                {group.label}
              </h2>
              <span className="text-xs text-black/50">
                {group.tasks.filter((task) => !task.completedAt).length} open
              </span>
            </div>
            {group.tasks.length ? (
              group.tasks.map((task) => (
                <div
                  key={task._id}
                  className={`flex items-start gap-3 border-b border-black/10 px-5 py-3.5 last:border-0 ${task.completedAt ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={!!task.completedAt}
                    onChange={() => toggle(task)}
                    aria-label={`${task.completedAt ? "Reopen" : "Complete"} ${task.text}`}
                    className="mt-0.5 h-4.5 w-4.5 cursor-pointer accent-teal-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${task.completedAt ? "line-through" : ""}`}
                    >
                      {task.text}
                    </p>
                    <p className="mt-1 text-xs text-black/55">
                      To {recipientName(task)} · From{" "}
                      {displayName(task.senderName)}
                    </p>
                    {task.senderName === currentUser && (
                      <div className="mt-1.5 flex gap-3">
                        <button
                          type="button"
                          onClick={() => openForm(task)}
                          className="text-xs font-semibold text-teal-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(task)}
                          className="text-xs font-semibold text-clay"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${task.priority === "High" && !task.completedAt ? "bg-alert text-clay" : "bg-flat text-black/70"}`}
                  >
                    {task.priority ?? "Routine"}
                  </span>
                </div>
              ))
            ) : (
              <p className="px-5 py-5 text-sm text-black/45">
                No tasks in this group.
              </p>
            )}
          </section>
        ))}
      </div>

      {editing !== undefined && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(undefined)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? "Edit task" : "New task"}
            </h2>
            <form onSubmit={save} className="flex flex-col gap-3">
              <textarea
                required
                autoFocus
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Task or message…"
                className="resize-none rounded-xl border border-black/10 p-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  required
                  value={recipientKey}
                  onChange={(event) => setRecipientKey(event.target.value)}
                  className="rounded-xl border border-black/10 bg-white p-2.5 text-sm"
                >
                  <option value="" disabled>
                    Assign to…
                  </option>
                  {receptionists.map((person) => (
                    <option
                      key={person._id}
                      value={`receptionist:${person._id}`}
                    >
                      {person.name}
                    </option>
                  ))}
                  {practitioners.map((person) => (
                    <option
                      key={person._id}
                      value={`practitioner:${person._id}`}
                    >
                      {person.name}
                    </option>
                  ))}
                </select>
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as typeof priority)
                  }
                  className="rounded-xl border border-black/10 bg-white p-2.5 text-sm"
                >
                  <option>Routine</option>
                  <option>High</option>
                </select>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(undefined)}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-black/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-teal-500 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-600"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3 text-xs text-white"
        >
          {notice}
        </div>
      )}
    </main>
  );
}
