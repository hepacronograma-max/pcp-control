import type {
  OmieListarPedidosResponse,
  OmiePedidoCompleto,
  OmiePedidoResumo,
  OmieRpcError,
} from "./types";

const PEDIDO_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
const CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const MIN_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

/** Métodos de escrita proibidos nesta entrega (guard rail). */
const BLOCKED_CALLS = new Set([
  "AlterarEtapaPedido",
  "IncluirPedido",
  "AlterarPedido",
  "ExcluirPedido",
  "StatusPedido",
  "TrocarEtapaPedido",
]);

type RpcResponse<T> = T & { faultstring?: string; faultcode?: string };

function normalizePedidoList(res: OmieListarPedidosResponse): OmiePedidoCompleto[] {
  const raw = res.pedido_venda_produto ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (entry && typeof entry === "object" && "cabecalho" in entry) {
      return entry as OmiePedidoCompleto;
    }
    const r = entry as OmiePedidoResumo;
    return {
      cabecalho: {
        codigo_pedido: r.codigo_pedido ?? r.cabecalho?.codigo_pedido,
        numero_pedido: r.numero_pedido ?? r.cabecalho?.numero_pedido,
        etapa: r.etapa ?? r.cabecalho?.etapa,
        codigo_cliente: r.cabecalho?.codigo_cliente,
        data_previsao: r.cabecalho?.data_previsao,
      },
      det: (entry as OmiePedidoCompleto).det,
    } satisfies OmiePedidoCompleto;
  });
}

export class OmieClient {
  private lastCallAt = 0;

  constructor(
    private readonly appKey = process.env.OMIE_APP_KEY?.trim() ?? "",
    private readonly appSecret = process.env.OMIE_APP_SECRET?.trim() ?? ""
  ) {}

  assertConfigured() {
    if (!this.appKey || !this.appSecret) {
      throw new Error("OMIE_APP_KEY e OMIE_APP_SECRET são obrigatórios");
    }
  }

  private async throttle() {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    }
    this.lastCallAt = Date.now();
  }

  private async call<T>(
    call: string,
    param: Record<string, unknown>,
    attempt = 0,
    baseUrl = PEDIDO_URL
  ): Promise<T> {
    if (BLOCKED_CALLS.has(call)) {
      throw new Error(`Método Omie bloqueado (somente leitura): ${call}`);
    }

    this.assertConfigured();
    await this.throttle();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call,
          app_key: this.appKey,
          app_secret: this.appSecret,
          param: [param],
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: RpcResponse<T> | OmieRpcError;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Omie ${call}: resposta inválida (HTTP ${res.status})`);
      }

      if ((json as OmieRpcError).faultstring) {
        throw new Error((json as OmieRpcError).faultstring);
      }

      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const delay = Math.min(30_000, 1000 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, delay));
          return this.call<T>(call, param, attempt + 1, baseUrl);
        }
        throw new Error(`Omie ${call} HTTP ${res.status}`);
      }

      return json as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Omie ${call}: timeout ${TIMEOUT_MS}ms`);
      }
      if (attempt < MAX_RETRIES && err instanceof Error) {
        const retryable =
          err.message.includes("429") ||
          err.message.includes("HTTP 5") ||
          err.message.includes("timeout");
        if (retryable) {
          const delay = Math.min(30_000, 1000 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, delay));
          return this.call<T>(call, param, attempt + 1, baseUrl);
        }
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Lista pedidos (somente leitura). Retorna resumos; use consultarPedido para itens completos.
   */
  async listarPedidos(opts: {
    etapa?: string;
    pagina?: number;
    registros_por_pagina?: number;
  }): Promise<{
    pedidos: OmiePedidoCompleto[];
    total_de_paginas: number;
    total_de_registros: number;
  }> {
    const pagina = opts.pagina ?? 1;
    const res = await this.call<OmieListarPedidosResponse>(
      "ListarPedidos",
      {
        pagina,
        registros_por_pagina: opts.registros_por_pagina ?? 50,
        apenas_importado_api: "N",
        etapa: opts.etapa,
        ordenar_por: "DATA_INCLUSAO",
      }
    );

    return {
      pedidos: normalizePedidoList(res),
      total_de_paginas: res.total_de_paginas ?? pagina,
      total_de_registros: res.total_de_registros ?? 0,
    };
  }

  /** Lista todas as páginas para uma etapa (somente leitura). */
  async listarTodosPedidosDaEtapa(etapa: string): Promise<OmiePedidoCompleto[]> {
    const all: OmiePedidoCompleto[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= totalPaginas) {
      const batch = await this.listarPedidos({
        etapa,
        pagina,
        registros_por_pagina: 50,
      });
      all.push(...batch.pedidos);
      totalPaginas = batch.total_de_paginas || 1;
      pagina += 1;
      if (!batch.pedidos.length) break;
    }

    return all;
  }

  /** Consulta pedido completo com itens (somente leitura). */
  async consultarPedido(codigo_pedido: number): Promise<OmiePedidoCompleto> {
    const res = await this.call<{ pedido_venda_produto?: OmiePedidoCompleto }>(
      "ConsultarPedido",
      { codigo_pedido }
    );
    return res.pedido_venda_produto ?? (res as unknown as OmiePedidoCompleto);
  }

  /** Consulta cadastro do cliente (somente leitura). */
  async consultarCliente(codigo_cliente_omie: number): Promise<{
    codigo_cliente_omie?: number;
    razao_social?: string;
    nome_fantasia?: string;
  }> {
    return this.call(
      "ConsultarCliente",
      { codigo_cliente_omie },
      0,
      CLIENTES_URL
    );
  }
}
