"use client";

import fixture from "@/lib/ui/overview-fixtures.json";
import { link, panel, panelHeaderArrow, panelHeaderLink, panelHeaderTitle, tagAlert, tagFlat } from "./ui";

type Task = (typeof fixture.tasks)[number];

export function ReceptionTodoPanel({
  tasks,
  done,
  onCheck,
  onReset,
  onPreview,
}: {
  tasks: Task[];
  done: string[];
  onCheck: (id: string) => void;
  onReset: () => void;
  onPreview: (label: string) => void;
}) {
  return (
    <section className={`${panel} h-115`}>
      <button type="button" className={panelHeaderLink} onClick={() => onPreview("All reception tasks")}>
        <h2 className={panelHeaderTitle}>Reception to-do</h2>
        <span className={panelHeaderArrow}>→</span>
      </button>
      <div className="flex-1 overflow-y-auto">
        {tasks.slice(0, 6).map((t) => (
          <div className="mx-6 flex items-start gap-3 border-b border-black/10 py-3.5 last:border-0" key={t.id}>
            <input
              type="checkbox"
              aria-label={`Complete ${t.text}`}
              checked={false}
              onChange={() => onCheck(t.id)}
              className="mt-0.5 h-4.5 w-4.5 flex-none cursor-pointer accent-[#14a3a8]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{t.text}</p>
              <small className="mt-1 flex flex-wrap gap-1.5 text-xs text-black/55">
                <button className={link} onClick={() => onPreview(t.patient)}>{t.patient}</button>
                <span>· {t.source}</span>
              </small>
            </div>
            <span className={t.priority === "High" ? tagAlert : tagFlat}>{t.priority}</span>
          </div>
        ))}
        {done.length > 0 && (
          <button className="w-full px-6 py-3 text-left text-xs text-black/55 underline" onClick={onReset}>
            Reset {done.length} completed demo tasks
          </button>
        )}
      </div>
    </section>
  );
}
