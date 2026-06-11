/** Tipos simplificados da API Omie (produtos/pedido) — somente leitura. */

export interface OmieRpcError {
  faultstring?: string;
  faultcode?: string;
}

export interface OmiePedidoCabecalho {
  codigo_pedido?: number;
  codigo_pedido_integracao?: string;
  numero_pedido?: string;
  /** Sufixo do orçamento no kanban (ex. "0001" → /1 junto com numero_pedido). */
  sequencial?: string | number;
  codigo_cliente?: number;
  data_previsao?: string;
  etapa?: string;
  nome_cliente?: string;
  quantidade_itens?: number;
}

export interface OmiePedidoItemProduto {
  /** Código de negócio (ex. HF-1579) — preferido para product_code no PCP. */
  codigo?: string;
  codigo_produto?: string | number;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
}

export interface OmiePedidoItemDet {
  ide?: { codigo_item_integracao?: string; codigo_item?: number };
  produto?: OmiePedidoItemProduto;
}

export interface OmiePedidoCompleto {
  cabecalho?: OmiePedidoCabecalho;
  det?: OmiePedidoItemDet[];
  informacoes_adicionais?: Record<string, unknown>;
}

export interface OmiePedidoResumo {
  cabecalho?: OmiePedidoCabecalho;
  codigo_pedido?: number;
  numero_pedido?: string;
  etapa?: string;
}

export interface OmieListarPedidosResponse {
  pedido_venda_produto?: OmiePedidoResumo[] | OmiePedidoCompleto[];
  total_de_registros?: number;
  total_de_paginas?: number;
  pagina?: number;
}

export interface PcpOrderImportDraft {
  companyId: string;
  orderNumber: string;
  clientName: string;
  deliveryDeadline: string | null;
  status: "imported";
  items: Array<{
    omieCodigoItem: number | null;
    description: string;
    quantity: number;
    productCode: string | null;
    /**
     * Valor bruto de det[].produto.quantidade (sem toQuantity).
     * Em pedidos parciais avançados reflete saldo pendente, não o total do pedido
     * (caso de homologação: pedido 260268).
     */
    omieQuantidadeBruta?: number | null;
  }>;
}

/** Resumo de casamento por pedido (Entrega 1.6). */
export interface PerOrderSyncSummary {
  omie_codigo_pedido?: number;
  order_number?: string;
  pcp_order_id?: string | null;
  total_itens_omie: number;
  total_itens_pcp: number;
  casados_chave_forte: number;
  casados_fallback_identico: number;
  casados_fallback_ordem: number;
  omie_codigo_item_preenchidos: number;
  itens_adicionados: number;
  itens_atualizados: number;
  itens_removidos: number;
  itens_marcados_removido_no_omie: number;
  itens_alertados: number;
  itens_qty_atualizados: number;
  itens_qty_divergentes_alertados: number;
  itens_qty_ignorados_nao_confiavel: number;
  alertas: Array<{
    motivo: string;
    omie_codigo_item?: number;
    product_code?: string;
  }>;
}

/** Relatório da importação / sync incremental (Entrega 1.5 + 1.6). */
export interface OmieImportReport {
  modo: "shadow" | "active";
  pedidos_novos: number;
  pedidos_sincronizados: number;
  itens_adicionados: number;
  itens_atualizados: number;
  itens_removidos: number;
  itens_marcados_removido_no_omie: number;
  erros: Array<{ omie_codigo_pedido?: number; message: string }>;
  /** Pedidos na etapa 20 listados no Omie nesta execução. */
  encontrados: number;
  skipped: number;
  skipped_reason?: "locked";
  shadow_logs?: string[];
  /** Resumo de casamento por pedido sincronizado (Entrega 1.6). */
  pedido_sync_resumos?: PerOrderSyncSummary[];
  /** Campos legados (Entrega 1) — derivados para compatibilidade. */
  criados: number;
  shadow_detectados: number;
}

export type OmieSyncIncrementalCounters = Pick<
  OmieImportReport,
  | "itens_adicionados"
  | "itens_atualizados"
  | "itens_removidos"
  | "itens_marcados_removido_no_omie"
>;
