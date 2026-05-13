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
  | "FAILED";

export type AttentionReason =
  | "ADDRESS_ERROR"
  | "DELAYED"
  | "NOTICE_CARD"
  | "STUCK";

export type PaymentMethod = "PREPAID" | "COD";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Mới",
  READY: "Sẵn sàng",
  ERROR: "Lỗi",
  ERROR_UPDATED: "Lỗi đã sửa",
  EXPORTED: "Đã xuất batch",
  LABEL_CREATED: "Có label",
  IN_TRANSIT: "Đang giao",
  DELIVERED: "Đã giao",
  FAILED: "Thất bại",
};

const ATTENTION_LABEL: Record<AttentionReason, string> = {
  ADDRESS_ERROR: "Sai địa chỉ",
  DELAYED: "Delay",
  NOTICE_CARD: "Notice card",
  STUCK: "Không cập nhật",
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PREPAID: "Trả trước",
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
