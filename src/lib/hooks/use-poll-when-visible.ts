import { useEffect, useRef } from "react";

/**
 * Executa callback em intervalo apenas com aba visível (economiza rede/CPU).
 */
export function usePollWhenVisible(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void cbRef.current();
    };

    run();
    const id = window.setInterval(run, intervalMs);
    const onFocus = () => void cbRef.current();
    const onVisible = () => {
      if (!document.hidden) void cbRef.current();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
