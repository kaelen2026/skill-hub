import { useEffect } from "react";

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div
      className="fixed bottom-9 left-1/2 z-60 max-w-[80vw] -translate-x-1/2 rounded-md border border-line-2 bg-panel px-4 py-2.5 text-[12.5px] break-all shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
      style={{ animation: "toast-in 180ms ease-out" }}
    >
      {message}
    </div>
  );
}
