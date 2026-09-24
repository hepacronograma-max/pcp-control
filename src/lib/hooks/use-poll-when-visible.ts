import { useEffect, useRef } from "react";

/** Intervalo padrão das telas operacionais (Pedidos, Linha, Comercial, etc.). */
export const LIVE_PAGE_POLL_MS = 20_000;

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

    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void cbRef.current();
    };

    if (immediate) run();
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
  }, [intervalMs, enabled, immediate]);
}
