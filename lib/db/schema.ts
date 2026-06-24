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
  // Có chuyển động vận chuyển SAU ngày giao → nghi hàng bị trả về (carrier không
  // phát mã RTS, vd giao vào parcel locker rồi thu hồi). Set bởi processor, KHÔNG
  // do classifyEvent sinh ra.
  "RETURN_SUSPECTED",
]);

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "STAFF",
  "CUSTOMER",
]);

export const flagColorEnum = pgEnum("flag_color", ["red", "yellow"]);

export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "STOCK_IN", // nhập kho (+)
  "ORDER_OUT", // đóng đơn / import label (−)
  "ADJUST", // kiểm kê / sửa tay (±)
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
  // Soft-delete: khi xóa batch → đơn EXPORTED revert về READY, batch giữ lại để lưu lý do (audit).
  deletedAt: timestamp("deleted_at"),
  deletedReason: text("deleted_reason"),
  deletedBy: text("deleted_by"),
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
    // Kho thực sự đóng đơn — gán lúc tạo batch (định tuyến theo region + tồn kho).
    // Dùng để trừ tồn đúng kho (đơn East fallback về BC không trừ nhầm kho E).
    warehouseCode: text("warehouse_code"),
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

    // Đối soát (kế toán dùng, hiển thị trong drawer)
    paymentType: text("payment_type"),           // ETF / BANK_TRANSFER / CHEQUE / MONEY_ORDER
    refNumber: text("ref_number"),               // Mã Ref từ email noti (chỉ ETF)
    paymentProofUrl: text("payment_proof_url"),  // URL ảnh chứng từ (non-ETF, Phase 2)
    reconciledAt: timestamp("reconciled_at"),    // Đối soát: khách đã up ảnh/ref
    accountedAt: timestamp("accounted_at"),      // Hạch toán: KDExpress đã ghi sổ
    accountedBy: text("accounted_by"),           // username người hạch toán

    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    syncedToSheetAt: timestamp("synced_to_sheet_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("orders_status_idx").on(t.status),
    customerIdx: index("orders_customer_idx").on(t.customerId),
    batchIdx: index("orders_batch_idx").on(t.batchId),
    attentionIdx: index("orders_attention_idx").on(t.attentionReason),
    unsyncedSheetIdx: index("orders_unsynced_sheet_idx").on(t.syncedToSheetAt),
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
// USERS / SESSIONS (auth)
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at"),
  },
  (t) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(t.username),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

// ============================================================================
// FLAGS / FLAG_MESSAGES (chat 2 chiều giữa KDE và customer)
// ============================================================================

export const flags = pgTable(
  "flags",
  {
    id: text("id").primaryKey(),
    orderUniqueKey: text("order_unique_key")
      .notNull()
      .references(() => orders.uniqueKey, { onDelete: "cascade" }),
    currentColor: flagColorEnum("current_color"), // NULL = đã gỡ cờ
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  },
  (t) => ({
    orderIdx: uniqueIndex("flags_order_idx").on(t.orderUniqueKey),
    colorIdx: index("flags_color_idx").on(t.currentColor),
    lastMsgIdx: index("flags_last_message_idx").on(t.lastMessageAt),
  }),
);

export const flagMessages = pgTable(
  "flag_messages",
  {
    id: text("id").primaryKey(),
    flagId: text("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    userRole: userRoleEnum("user_role").notNull(),
    userName: text("user_name").notNull(), // snapshot phòng user đổi tên
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    flagIdx: index("flag_messages_flag_idx").on(t.flagId),
    createdIdx: index("flag_messages_created_idx").on(t.createdAt),
  }),
);

// ============================================================================
// WAREHOUSES + INVENTORY (tồn kho theo từng kho)
// ============================================================================
//
// Mục đích: kho Ontario (EAST) chỉ trữ một SỐ mặt hàng, không đủ như kho BC
// (WEST). Region thuần theo địa chỉ đích là chưa đủ để định tuyến — phải biết
// kho đó có "theo dõi" (= có trữ) mặt hàng + còn đủ số lượng không.
//
//   - warehouses: 1 dòng / kho. code khớp Region ("WEST" | "EAST").
//   - inventory_tracking: cấu hình (kho × product) — chỉ product `tracked`
//     mới bị trừ; `onHand` là tồn hiện tại (cache, nguồn gốc là ledger).
//   - inventory_movements: ledger mọi biến động (nhập/xuất/chỉnh) — audit đầy đủ.

export const warehouses = pgTable("warehouses", {
  code: text("code").primaryKey(), // "WEST" | "EAST" — khớp Region
  name: text("name").notNull(), // VD: "Kho BC", "Kho Ontario"
  region: text("region").notNull(), // WEST | EAST — region đơn map về kho này
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryTracking = pgTable(
  "inventory_tracking",
  {
    id: text("id").primaryKey(), // `${warehouseCode}__${productId}`
    warehouseCode: text("warehouse_code")
      .notNull()
      .references(() => warehouses.code),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    tracked: boolean("tracked").default(true).notNull(),
    trackedSince: timestamp("tracked_since"), // chỉ trừ đơn có ngày ≥ mốc này
    onHand: integer("on_hand").default(0).notNull(), // tồn hiện tại (cache từ ledger)
    lowStockThreshold: integer("low_stock_threshold"), // cảnh báo khi onHand ≤ ngưỡng
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    whProd: uniqueIndex("inventory_tracking_wh_prod").on(
      t.warehouseCode,
      t.productId,
    ),
    whIdx: index("inventory_tracking_wh_idx").on(t.warehouseCode),
  }),
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    warehouseCode: text("warehouse_code")
      .notNull()
      .references(() => warehouses.code),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    delta: integer("delta").notNull(), // + nhập, − xuất
    type: inventoryMovementTypeEnum("type").notNull(),
    refOrderKey: text("ref_order_key").references(() => orders.uniqueKey), // ORDER_OUT: đơn nguồn
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    whProdIdx: index("inventory_movements_wh_prod_idx").on(
      t.warehouseCode,
      t.productId,
    ),
    // 1 đơn chỉ trừ đúng 1 lần (idempotent). NULL (STOCK_IN/ADJUST) → nhiều NULL OK.
    refOrderUnique: uniqueIndex("inventory_movements_ref_order_unique").on(
      t.refOrderKey,
    ),
  }),
);

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
