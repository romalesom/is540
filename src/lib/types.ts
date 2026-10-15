export type Item = {
  item_id: string;
  model: string;
  category: string;
  supplier_id: string;
  tracking_mode: "Serialized" | "Quantity";
  unit_cost_eur: number;
  sale_price_eur: number;
  reorder_point: number;
  reorder_qty: number;
  status: "Active" | "Discontinued";
};

export type Location = {
  location_id: string;
  location_name: string;
  city: string | null;
  country: string | null;
};

export type Supplier = {
  supplier_id: string;
  supplier_name: string;
  country: string | null;
  lead_time_days: number;
  contact: string | null;
};

export type StockStatus = "out" | "low" | "ok";

export type InventoryRow = Item & {
  supplier_name: string;
  stock_by_location: Record<string, number>;
  stock_qty: number;
  on_order_qty: number;
  stock_value_eur: number;
  stock_status: StockStatus;
};

export type Role = "viewer" | "manager";

export type Customer = {
  customer_id: string;
  customer_name: string;
  city: string | null;
  country: string | null;
  contact: string | null;
};
