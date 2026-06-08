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
  }>;
}

/** Relatório da importação / sync incremental (Entrega 1.5). */
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
