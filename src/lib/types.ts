export type Item = {
  item_id: string;
  model: string;
  category: string;
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
  status: "Active" | "Inactive";
};

// One supplier's offer for an item (item_suppliers). lead_time_days is the
// effective value: the item-specific override or the supplier's default.
export type SupplierOffer = {
  supplier_id: string;
  supplier_name: string;
  unit_cost_eur: number;
  lead_time_days: number;
  lead_time_override: number | null;
  /** Inactive suppliers keep their prices but cannot be ordered from. */
  active: boolean;
};

export type StockStatus = "out" | "low" | "ok";

export type InventoryRow = Item & {
  /** Sorted cheapest first (ties: shorter lead time, then name). */
  suppliers: SupplierOffer[];
  /** Name of the cheapest supplier, for compact display. */
  supplier_name: string;
  stock_by_location: Record<string, number>;
  stock_qty: number;
  on_order_qty: number;
  /** Units on the way between two own locations: valued, but not available. */
  in_transit_qty: number;
  /** (stock_qty + in_transit_qty) × standard cost. */
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
  status: "Active" | "Inactive";
};
