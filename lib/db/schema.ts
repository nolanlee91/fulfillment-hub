import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUMS
// ============================================================================

export const orderStatusEnum = pgEnum("order_status", [
  "NEW",
  "READY",
  "ERROR",
  "EXPORTED",
  "ERROR_UPDATED",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["PREPAID", "COD"]);

export const platformEnum = pgEnum("platform", ["CLICKSHIP", "EST"]);

export const attentionReasonEnum = pgEnum("attention_reason", [
  "ADDRESS_ERROR",
  "DELAYED",
  "NOTICE_CARD",
  "STUCK",
]);

// ============================================================================
// CUSTOMERS
// ============================================================================

export const customers = pgTable("customers", {
  id: text("id").primaryKey(), // VD: "venatureco", "skylane"
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// PRODUCTS
// ============================================================================

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(), // VD: "fitgum", "baku", "fitgum_acai"
    name: text("name").notNull(), // VD: "Fitgum", "Fitgum Acai"
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    unitWeightLb: numeric("unit_weight_lb", { precision: 10, scale: 4 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: index("products_name_idx").on(t.name),
  }),
);

// ============================================================================
// SOURCE SHEETS (cấu hình 13 sheet nguồn)
// ============================================================================

export const sourceSheets = pgTable("source_sheets", {
  id: text("id").primaryKey(), // VD: "venatureco_fitgum"
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  spreadsheetId: text("spreadsheet_id").notNull(),
  sheetName: text("sheet_name").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// BOXES
// ============================================================================

export const boxes = pgTable("boxes", {
  code: text("code").primaryKey(), // VD: "A", "B", "C", "D"
  name: text("name").notNull(),
  lengthIn: numeric("length_in", { precision: 10, scale: 2 }).notNull(),
  widthIn: numeric("width_in", { precision: 10, scale: 2 }).notNull(),
  heightIn: numeric("height_in", { precision: 10, scale: 2 }).notNull(),
  emptyWeightLb: numeric("empty_weight_lb", { precision: 10, scale: 4 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// BOX RULES (product × box → max_qty)
// ============================================================================

export const boxRules = pgTable(
  "box_rules",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    boxCode: text("box_code")
      .notNull()
      .references(() => boxes.code),
    maxQty: integer("max_qty").notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => ({
    uniqueRule: uniqueIndex("box_rules_unique").on(t.productId, t.boxCode),
  }),
);

// ============================================================================
// BATCHES
// ============================================================================

export const batches = pgTable("batches", {
  id: text("id").primaryKey(), // VD: "2026-04-27-PM-001"
  totalOrders: integer("total_orders").default(0).notNull(),
  platform: platformEnum("platform"), // CLICKSHIP | EST
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  exportedAt: timestamp("exported_at"),
});

// ============================================================================
// ORDERS (table chính)
// ============================================================================

export const orders = pgTable(
  "orders",
  {
    uniqueKey: text("unique_key").primaryKey(),

    orderId: text("order_id").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),

    orderDate: timestamp("order_date"),

    titleName: text("title_name"),
    name: text("name"),
    lastName: text("last_name"),
    titleDept: text("title_dept"),
    companyName: text("company_name"),
    additionalAddressInfo: text("additional_address_info"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    province: text("province"),
    zipcode: text("zipcode"),
    country: text("country"),
    phone: text("phone"),

    quantity: integer("quantity").default(0).notNull(),

    paymentMethod: paymentMethodEnum("payment_method").default("PREPAID").notNull(),
    codAmount: numeric("cod_amount", { precision: 10, scale: 2 }),
    note: text("note"),

    status: orderStatusEnum("status").default("NEW").notNull(),
    boxCode: text("box_code").references(() => boxes.code),
    errorNote: text("error_note"),
    batchId: text("batch_id").references(() => batches.id),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    shippingCarrier: text("shipping_carrier"),
    shipDate: timestamp("ship_date"),
    lastTrackingEvent: text("last_tracking_event"),
    lastTrackingAt: timestamp("last_tracking_at"),
    deliveredAt: timestamp("delivered_at"),

    attentionReason: attentionReasonEnum("attention_reason"),
    attentionAt: timestamp("attention_at"),
    attentionNote: text("attention_note"),

    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("orders_status_idx").on(t.status),
    customerIdx: index("orders_customer_idx").on(t.customerId),
    batchIdx: index("orders_batch_idx").on(t.batchId),
    attentionIdx: index("orders_attention_idx").on(t.attentionReason),
  }),
);

// ============================================================================
// TRACKING FILES (dedup file APT đã xử lý)
// ============================================================================

export const trackingFiles = pgTable("tracking_files", {
  filename: text("filename").primaryKey(),
  source: text("source").notNull(), // VD: "APT"
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  totalRows: integer("total_rows").default(0).notNull(),
  totalUpdated: integer("total_updated").default(0).notNull(),
});

// ============================================================================
// SYNC LOG
// ============================================================================

export const syncLogs = pgTable("sync_logs", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  totalAdded: integer("total_added").default(0).notNull(),
  totalErrors: integer("total_errors").default(0).notNull(),
  details: text("details"),
  triggeredBy: text("triggered_by"),
});
