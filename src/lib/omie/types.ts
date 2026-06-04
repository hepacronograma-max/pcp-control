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
    description: string;
    quantity: number;
    productCode: string | null;
  }>;
}

export interface OmieImportReport {
  modo: "shadow" | "active";
  encontrados: number;
  criados: number;
  shadow_detectados: number;
  skipped: number;
  erros: Array<{ omie_codigo_pedido?: number; message: string }>;
  /** Presente quando lock omie-import já está ativo. */
  skipped_reason?: "locked";
}
