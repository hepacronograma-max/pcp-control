import { useEffect, useRef } from "react";

/** Intervalo padrão das telas operacionais (Pedidos, Linha, Comercial, etc.). */
export const LIVE_PAGE_POLL_MS = 45_000;

/** Fetch GET sem cache do browser — todos os logins veem o banco atual. */
export const liveGetInit: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

export type PollWhenVisibleOptions = {
  /** Se false, não dispara no mount (a página já tem load inicial). Default true. */
  immediate?: boolean;
};

/**
 * Executa callback em intervalo apenas com aba visível (economiza rede/CPU).
 * Também atualiza ao focar a janela ou voltar para a aba.
 */
export function usePollWhenVisible(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
  options?: PollWhenVisibleOptions
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const immediate = options?.immediate !== false;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let lastRun = 0;
    const minGapMs = Math.min(8_000, Math.max(3_000, Math.floor(intervalMs / 4)));
    const runThrottled = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      if (lastRun > 0 && now - lastRun < minGapMs) return;
      lastRun = now;
      void cbRef.current();
    };

    if (immediate) runThrottled();
    const id = window.setInterval(runThrottled, intervalMs);
    const onFocus = () => runThrottled();
    const onVisible = () => runThrottled();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled, immediate]);
}
