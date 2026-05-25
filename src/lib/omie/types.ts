/** Tipos simplificados da API Omie (produtos/pedido + geral/clientes). */

export interface OmieRpcError {
  faultstring?: string;
  faultcode?: string;
}

export interface OmiePedidoCabecalho {
  codigo_pedido?: number;
  codigo_pedido_integracao?: string;
  numero_pedido?: string;
  codigo_cliente?: number;
  codigo_cliente_integracao?: string;
  data_previsao?: string;
  etapa?: string;
  quantidade_itens?: number;
  bloqueado?: string;
}

export interface OmiePedidoItemProduto {
  codigo_produto?: string | number;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
  valor_unitario?: number;
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
  codigo_pedido?: number;
  numero_pedido?: string;
  etapa?: string;
  codigo_cliente?: number;
  valor_total_pedido?: number;
}

export interface OmieListarPedidosResponse {
  pedido_venda_produto?: OmiePedidoResumo[];
  total_de_registros?: number;
  total_de_paginas?: number;
  pagina?: number;
}

export interface OmieClienteCadastro {
  codigo_cliente_omie?: number;
  codigo_cliente_integracao?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj_cpf?: string;
}

export interface OmieWebhookPayload {
  event_id?: string;
  id?: string;
  event_type?: string;
  topic?: string;
  type?: string;
  codigo_pedido?: number;
  nCodPed?: number;
  etapa?: string;
  etapa_anterior?: string;
  nova_etapa?: string;
  numero_pedido?: string;
  [key: string]: unknown;
}

export interface PcpOrderDraft {
  companyId: string;
  orderNumber: string;
  clientName: string;
  deliveryDeadline: string | null;
  status: "imported";
  items: Array<{
    description: string;
    quantity: number;
    productCode: string | null;
    lineName: string;
  }>;
}
