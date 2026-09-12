"use client";

export function NoticeToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-20 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-5 rounded-2xl bg-[#1a1a1a] px-5 py-3.5 text-xs text-white shadow-xl">
      {message}
      <button aria-label="Dismiss message" onClick={onDismiss} className="text-lg leading-none">×</button>
    </div>
  );
}
