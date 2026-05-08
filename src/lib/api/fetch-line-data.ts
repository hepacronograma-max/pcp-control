/**
 * Chamada resiliente a GET /api/line-data — timeout + erro legível (evita «Carregando…» eterno).
 */
const DEFAULT_TIMEOUT_MS = 55_000;

export async function fetchLineDataRequest(
  params: {
    lineId: string;
    tab: string;
    almoxPeriod: string;
    almoxLimit?: string;
    almoxOffset?: string;
  },
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<unknown> {
  const qs = new URLSearchParams({
    lineId: params.lineId,
    tab: params.tab,
    almoxPeriod: params.almoxPeriod,
  });
  if (params.almoxLimit != null) qs.set("almoxLimit", params.almoxLimit);
  if (params.almoxOffset != null) qs.set("almoxOffset", params.almoxOffset);

  const url = `/api/line-data?${qs.toString()}`;

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outer = opts?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      throw new Error(
        `line-data falhou (${res.status} ${res.statusText}). Verifique servidor e sessão local.`
      );
    }
    return await res.json();
  } catch (e) {
    clearTimeout(t);
    const msg =
      controller.signal.aborted &&
      !(outer as AbortSignal | undefined)?.aborted
        ? `Tempo limite (${Math.round(timeoutMs / 1000)}s). A API pode estar lenta ou indisponível.`
        : e instanceof Error
          ? e.message
          : "Falha ao carregar dados da linha.";
    throw new Error(msg);
  }
}
