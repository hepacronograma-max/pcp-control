// src/lib/types/cq.ts
export type CQGravidade = "baixa" | "media" | "alta" | "critica";
export type CQTargetType = "order" | "order_item" | "purchase_order";

export interface CQRegistro {
  id: string;
  company_id: string;
  target_type: CQTargetType;
  target_id: string;
  registered_by: string;
  registered_by_role: string;
  categoria: string;
  descricao: string | null;
  gravidade: CQGravidade;
  created_at: string;
  updated_at: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
  resolucao: string | null;
  metadata: Record<string, any>;
}

export interface CQCategoria {
  id: string;
  company_id: string;
  role: string;
  categoria: string;
  cor: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// Para usar nos componentes
export interface CQFieldProps {
  targetType: CQTargetType;
  targetId: string;
  userRole: string;
  onRegistred?: () => void;
}
