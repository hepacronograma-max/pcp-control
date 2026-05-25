import type {
  OmieClienteCadastro,
  OmieListarPedidosResponse,
  OmiePedidoCompleto,
  OmieRpcError,
} from "./types";

const PEDIDO_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
const CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";

const MIN_INTERVAL_MS = 1100;

type RpcResponse<T> = T & { faultstring?: string; faultcode?: string };

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
    endpoint: string,
    call: string,
    param: Record<string, unknown>,
    attempt = 0
  ): Promise<T> {
    this.assertConfigured();
    await this.throttle();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(endpoint, {
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
        throw new Error(`Omie ${call}: resposta inválida (${res.status})`);
      }

      if (!res.ok) {
        const err = json as OmieRpcError;
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
          const delay = Math.min(30_000, 1000 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, delay));
          return this.call<T>(endpoint, call, param, attempt + 1);
        }
        throw new Error(
          err.faultstring || `Omie ${call} HTTP ${res.status}`
        );
      }

      if ((json as OmieRpcError).faultstring) {
        throw new Error((json as OmieRpcError).faultstring);
      }

      return json as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listarPedidos(opts: {
    data_inicio?: string;
    data_fim?: string;
    etapa?: string;
    pagina?: number;
    registros_por_pagina?: number;
  }): Promise<OmiePedidoCompleto[]> {
    const pedidos: OmiePedidoCompleto[] = [];
    let pagina = opts.pagina ?? 1;
    const registros = opts.registros_por_pagina ?? 50;
    let totalPaginas = 1;

    while (pagina <= totalPaginas) {
      const res = await this.call<OmieListarPedidosResponse & { pedido_venda_produto?: unknown }>(
        PEDIDO_URL,
        "ListarPedidos",
        {
          pagina,
          registros_por_pagina: registros,
          apenas_importado_api: "N",
          filtrar_por_data_de: opts.data_inicio,
          filtrar_por_data_ate: opts.data_fim,
          etapa: opts.etapa,
          ordenar_por: "DATA_INCLUSAO",
        }
      );

      const lista = normalizePedidoList(res);
      for (const entry of lista) {
        const codigo = entry.cabecalho?.codigo_pedido ?? (entry as { codigo_pedido?: number }).codigo_pedido;
        if (codigo) {
          const full = await this.consultarPedido(codigo);
          pedidos.push(full);
        } else {
          pedidos.push(entry);
        }
      }

      totalPaginas = res.total_de_paginas ?? pagina;
      pagina += 1;
      if (!lista.length) break;
    }

    return pedidos;
  }

  async consultarPedido(codigo: number): Promise<OmiePedidoCompleto> {
    const res = await this.call<{ pedido_venda_produto?: OmiePedidoCompleto }>(
      PEDIDO_URL,
      "ConsultarPedido",
      { codigo_pedido: codigo }
    );
    return res.pedido_venda_produto ?? (res as unknown as OmiePedidoCompleto);
  }

  async listarClientes(opts: {
    pagina?: number;
    registros_por_pagina?: number;
    filtrar_por_data_de?: string;
  }): Promise<OmieClienteCadastro[]> {
    const res = await this.call<{
      clientes_cadastro?: OmieClienteCadastro[];
      total_de_paginas?: number;
    }>(CLIENTES_URL, "ListarClientes", {
      pagina: opts.pagina ?? 1,
      registros_por_pagina: opts.registros_por_pagina ?? 50,
      filtrar_por_data_de: opts.filtrar_por_data_de,
    });
    return res.clientes_cadastro ?? [];
  }

  async consultarCliente(codigoCliente: number): Promise<OmieClienteCadastro | null> {
    try {
      const res = await this.call<{ clientes_cadastro?: OmieClienteCadastro[] }>(
        CLIENTES_URL,
        "ConsultarCliente",
        { codigo_cliente_omie: codigoCliente }
      );
      const one = res.clientes_cadastro?.[0];
      return one ?? null;
    } catch {
      return null;
    }
  }
}

function normalizePedidoList(res: unknown): OmiePedidoCompleto[] {
  if (!res || typeof res !== "object") return [];
  const r = res as Record<string, unknown>;
  const raw = r.pedido_venda_produto ?? r.pedidos ?? r.lista_pedidos;
  if (!Array.isArray(raw)) return [];
  return raw as OmiePedidoCompleto[];
}
