import type { ReactNode } from "react";

export type OrderStatus =
  | "NEW"
  | "READY"
  | "ERROR"
  | "ERROR_UPDATED"
  | "EXPORTED"
  | "LABEL_CREATED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "OUT_OF_STOCK"
  | "CANCELLED";

export type AttentionReason =
  | "ADDRESS_ERROR"
  | "DELAYED"
  | "NOTICE_CARD"
  | "STUCK"
  | "RETURN_SUSPECTED";

export type PaymentMethod = "PREPAID" | "COD";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "New",
  READY: "Ready",
  ERROR: "Error",
  ERROR_UPDATED: "Updated",
  EXPORTED: "Exported",
  LABEL_CREATED: "Label Created",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  OUT_OF_STOCK: "Out of Stock",
  CANCELLED: "Cancelled",
};

const ATTENTION_LABEL: Record<AttentionReason, string> = {
  ADDRESS_ERROR: "Address Error",
  DELAYED: "Delayed",
  NOTICE_CARD: "Notice Card",
  STUCK: "No Updates",
  RETURN_SUSPECTED: "Returned?",
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PREPAID: "Prepaid",
  COD: "COD",
};

interface BaseBadgeProps {
  /** Override label mặc định. */
  children?: ReactNode;
  /** Class bổ sung. */
  className?: string;
}

interface StatusBadgeProps extends BaseBadgeProps {
  status: OrderStatus;
}

export function StatusBadge({ status, children, className = "" }: StatusBadgeProps) {
  return (
    <span className={`status-${status} ${className}`}>
      {children ?? ORDER_STATUS_LABEL[status]}
    </span>
  );
}

interface AttentionBadgeProps extends BaseBadgeProps {
  reason: AttentionReason;
}

export function AttentionBadge({
  reason,
  children,
  className = "",
}: AttentionBadgeProps) {
  return (
    <span className={`attention-${reason} ${className}`}>
      {children ?? ATTENTION_LABEL[reason]}
    </span>
  );
}

interface PaymentBadgeProps extends BaseBadgeProps {
  method: PaymentMethod;
}

export function PaymentBadge({
  method,
  children,
  className = "",
}: PaymentBadgeProps) {
  return (
    <span className={`payment-${method} ${className}`}>
      {children ?? PAYMENT_LABEL[method]}
    </span>
  );
}
