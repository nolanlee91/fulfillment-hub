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
  jsonb,
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

// Module Lưu kho (3PL): khách gửi pallet ở kho rồi đến pick up.
export const storagePalletStatusEnum = pgEnum("storage_pallet_status", [
  "IN_STORAGE", // còn hàng trong kho
  "PICKED_UP", // đã lấy hết unit → rời kho
  "DISPOSED", // tiêu hủy
]);

export const storageMovementTypeEnum = pgEnum("storage_movement_type", [
  "RECEIVE_IN", // nhập kho (+ unit)
  "PICKUP_OUT", // xuất/khách lấy (− unit)
  "ADJUST", // kiểm kê / sửa tay (±)
]);

// Đơn vị tính phí nhận/xuất: nguyên pallet ($10) hoặc lẻ từng unit ($1).
export const storageUomEnum = pgEnum("storage_uom", ["PALLET", "UNIT"]);

// Yêu cầu lấy hàng của khách (Phase 2). PENDING editable tới khi staff chốt DONE.
export const storageRequestStatusEnum = pgEnum("storage_request_status", [
  "PENDING",
  "DONE",
  "CANCELLED",
]);

// Cơ sở tính phí lưu kho của khách: theo tuần hoặc theo tháng.
export const storageBasisEnum = pgEnum("storage_basis", ["WEEK", "MONTH"]);

// ============================================================================
// CUSTOMERS
// ============================================================================

export const customers = pgTable("customers", {
  id: text("id").primaryKey(), // VD: "venatureco", "skylane"
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
  // Phân loại dịch vụ: 1 khách có thể dùng Fulfillment, Storage, hoặc cả hai.
  // Quyết định menu khách thấy khi đăng nhập (storage-only không thấy Fulfillment).
  fulfillmentEnabled: boolean("fulfillment_enabled").default(true).notNull(),
  storageEnabled: boolean("storage_enabled").default(false).notNull(),
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
    // Tab chứa NHIỀU mặt hàng trong 1 kiện (vd Baku = Serum + Cream): quantity vẫn
    // là TỔNG (để tính hộp/cân), còn đây lưu chia từng loại {variantProductId: qty}
    // để trừ tồn kho riêng. NULL với tab 1 mặt hàng bình thường.
    itemBreakdown: jsonb("item_breakdown").$type<Record<string, number>>(),

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

    // Đối soát — SUMMARY denormalized của bảng con `order_payments` (recompute
    // sau mỗi mutation qua recomputeOrderReconSummary). 1 đơn có thể có NHIỀU khoản.
    paymentType: text("payment_type"),           // type của khoản mới nhất (representative)
    refNumber: text("ref_number"),               // ref của khoản ETF mới nhất
    paymentProofUrl: text("payment_proof_url"),  // proof của khoản non-ETF mới nhất
    reconciledAt: timestamp("reconciled_at"),    // MIN reconciledAt các khoản (null nếu chưa có khoản nào)
    accountedAt: timestamp("accounted_at"),      // chỉ set khi MỌI khoản đã booked (fully booked)
    accountedBy: text("accounted_by"),           // username người book khoản cuối

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
// ORDER PAYMENTS (đối soát: 1 dòng / khoản thanh toán — 1 đơn có thể nhiều khoản)
// ============================================================================
//
// Trước đây mỗi đơn chỉ lưu 1 khoản đối soát ngay trên `orders`. Thực tế khách
// có thể thanh toán NHIỀU lần cho 1 đơn (vd trả 2 lần) → tách bảng con này.
// Booked (accountedAt) tính THEO TỪNG KHOẢN. Các cột reconciliation trên `orders`
// còn lại làm summary denormalized để list/filter không phải join.

export const orderPayments = pgTable(
  "order_payments",
  {
    id: text("id").primaryKey(), // vd `pay_<ts>_<rand>`
    orderUniqueKey: text("order_unique_key")
      .notNull()
      .references(() => orders.uniqueKey, { onDelete: "cascade" }),
    paymentType: text("payment_type").notNull(), // ETF | BANK_TRANSFER | CHEQUE | MONEY_ORDER
    refNumber: text("ref_number"), // chỉ ETF
    proofUrl: text("payment_proof_url"), // chỉ non-ETF (R2 URL)
    reconciledAt: timestamp("reconciled_at").defaultNow().notNull(),
    accountedAt: timestamp("accounted_at"), // booked per-khoản
    accountedBy: text("accounted_by"),
    createdBy: text("created_by"), // username hoặc "CUSTOMER:<id>"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    orderIdx: index("order_payments_order_idx").on(t.orderUniqueKey),
    refIdx: index("order_payments_ref_idx").on(t.refNumber),
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
    // ORDER_OUT: đơn nguồn. SET NULL khi xóa đơn → không chặn xóa, giữ ledger audit.
    refOrderKey: text("ref_order_key").references(() => orders.uniqueKey, {
      onDelete: "set null",
    }),
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

// ============================================================================
// STORAGE (Lưu kho 3PL) — Phase 1
//   - storage_pallets: mỗi pallet 1 record (1 SKU/pallet), có tồn unit hiện tại.
//   - storage_movements: ledger nhập/xuất unit theo pallet (audit + phí nhận/xuất).
// Phase 2 (khách + pickup request) và Phase 3 (phí lưu kho + hóa đơn) thêm sau.
// ============================================================================

export const storagePallets = pgTable(
  "storage_pallets",
  {
    id: text("id").primaryKey(),
    palletCode: text("pallet_code").notNull(), // mã in barcode dán pallet
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    warehouseCode: text("warehouse_code")
      .notNull()
      .references(() => warehouses.code),
    // CACHE tóm tắt (nguồn thật = storage_pallet_items). Giữ để report/inventory cũ
    // chạy tiếp: productName = "A + B", unitCount = TỔNG các SKU con.
    productName: text("product_name").notNull(),
    unitCount: integer("unit_count").default(0).notNull(),
    initialUnits: integer("initial_units").default(0).notNull(),
    status: storagePalletStatusEnum("status").default("IN_STORAGE").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    pickedUpAt: timestamp("picked_up_at"), // khi TỔNG unit về 0 (mọi SKU hết)
    photoUrl: text("photo_url"),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    codeUnique: uniqueIndex("storage_pallets_code_unique").on(t.palletCode),
    customerIdx: index("storage_pallets_customer_idx").on(t.customerId),
    statusIdx: index("storage_pallets_status_idx").on(t.status),
  }),
);

// Từng SKU trong 1 pallet (pallet trộn = nhiều dòng). Nguồn THẬT của sản phẩm/tồn.
export const storagePalletItems = pgTable(
  "storage_pallet_items",
  {
    id: text("id").primaryKey(),
    palletId: text("pallet_id")
      .notNull()
      .references(() => storagePallets.id),
    productName: text("product_name").notNull(),
    unitCount: integer("unit_count").default(0).notNull(), // tồn hiện tại của SKU này
    initialUnits: integer("initial_units").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    palletIdx: index("storage_pallet_items_pallet_idx").on(t.palletId),
  }),
);

export const storageMovements = pgTable(
  "storage_movements",
  {
    id: text("id").primaryKey(),
    palletId: text("pallet_id")
      .notNull()
      .references(() => storagePallets.id),
    // SKU cụ thể bị tác động (pallet trộn). Null = dòng cũ / mức pallet.
    palletItemId: text("pallet_item_id").references(() => storagePalletItems.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id), // denormalize để query theo khách nhanh
    type: storageMovementTypeEnum("type").notNull(),
    units: integer("units").notNull(), // + nhập, − xuất (signed như inventory.delta)
    uom: storageUomEnum("uom").notNull(), // PALLET / UNIT → cơ sở tính phí nhận/xuất
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    palletIdx: index("storage_movements_pallet_idx").on(t.palletId),
    customerIdx: index("storage_movements_customer_idx").on(t.customerId),
  }),
);

// Phase 2: khách tự tạo yêu cầu lấy hàng (unit-level, cắt nhiều pallet).
// PENDING = còn sửa được; staff nhập confirmedUnits số thực khi hàng ra kho → DONE.
export const storagePickupRequests = pgTable(
  "storage_pickup_requests",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    status: storageRequestStatusEnum("status").default("PENDING").notNull(),
    requestedDate: timestamp("requested_date"), // ngày khách muốn lấy
    note: text("note"),
    createdBy: text("created_by"),
    // Xác nhận 2 phía: STAFF chốt số thực (trừ kho) + CUSTOMER đồng ý số cuối.
    // Cả 2 có timestamp = 2 bên đã thống nhất.
    confirmedBy: text("confirmed_by"), // = STAFF confirm (username người chốt)
    confirmedAt: timestamp("confirmed_at"),
    customerConfirmedBy: text("customer_confirmed_by"), // username khách bấm "Đồng ý"
    customerConfirmedAt: timestamp("customer_confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    customerIdx: index("storage_requests_customer_idx").on(t.customerId),
    statusIdx: index("storage_requests_status_idx").on(t.status),
  }),
);

// Rate lưu kho RIÊNG từng khách (mỗi khách 1 mức). Excel report áp rate này để
// tự tính tiền. Seed mặc định theo bảng giá June 2026 khi bật Storage cho khách.
export const storageCustomerRates = pgTable("storage_customer_rates", {
  customerId: text("customer_id")
    .primaryKey()
    .references(() => customers.id),
  handlingPerPallet: numeric("handling_per_pallet", { precision: 10, scale: 2 })
    .default("10")
    .notNull(),
  handlingPerUnit: numeric("handling_per_unit", { precision: 10, scale: 2 })
    .default("1")
    .notNull(),
  storagePerWeek: numeric("storage_per_week", { precision: 10, scale: 2 })
    .default("15")
    .notNull(),
  storagePerMonth: numeric("storage_per_month", { precision: 10, scale: 2 })
    .default("50")
    .notNull(),
  basis: storageBasisEnum("basis").default("MONTH").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const storagePickupRequestItems = pgTable(
  "storage_pickup_request_items",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => storagePickupRequests.id),
    palletId: text("pallet_id")
      .notNull()
      .references(() => storagePallets.id),
    // SKU cụ thể khách chọn (pallet trộn). Null = request cũ (pallet 1 SKU).
    palletItemId: text("pallet_item_id").references(() => storagePalletItems.id),
    units: integer("units").notNull(), // số unit khách YÊU CẦU lấy
    uom: storageUomEnum("uom").notNull(), // PALLET (nguyên) / UNIT (lẻ)
    confirmedUnits: integer("confirmed_units"), // số THỰC khi DONE (NULL tới lúc chốt)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    requestIdx: index("storage_request_items_request_idx").on(t.requestId),
  }),
);
