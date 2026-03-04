export type UserRole = "super_admin" | "manager" | "pcp" | "operator";
export type OrderStatus =
  | "imported"
  | "planning"
  | "in_production"
  | "ready"
  | "finished"
  | "delayed";
export type ItemStatus =
  | "waiting"
  | "scheduled"
  | "completed"
  | "delayed";

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  import_path: string | null;
  orders_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductionLine {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  company_id: string;
  order_number: string;
  client_name: string;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  production_deadline: string | null;
  status: OrderStatus;
  pdf_path: string | null;
  folder_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  created_by: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_number: number;
  description: string;
  quantity: number;
  line_id: string | null;
  pcp_deadline: string | null;
  production_start: string | null;
  production_end: string | null;
  status: ItemStatus;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  company_id: string;
  date: string;
  description: string;
  is_recurring: boolean;
  created_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface OrderItemWithLine extends OrderItem {
  production_line?: ProductionLine;
  order?: Order;
}

