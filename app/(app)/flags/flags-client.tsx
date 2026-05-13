"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";
type FlagColor = "red" | "yellow" | null;

interface FlagListItem {
  flagId: string;
  orderUniqueKey: string;
  orderId: string;
  customerId: string;
  customerName: string | null;
  productId: string;
  productName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  currentColor: FlagColor;
  resolvedAt: string | null;
  lastMessageAt: string;
  createdAt: string;
}

interface DetailOrder {
  uniqueKey: string;
  orderId: string;
  customerId: string;
  customerName: string | null;
  productId: string;
  productName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

interface DetailFlag {
  id: string;
  currentColor: FlagColor;
  resolvedAt: string | null;
  createdAt: string;
  lastMessageAt: string;
}

interface DetailMessage {
  id: string;
  userId: string;
  userRole: Role;
  userName: string;
  content: string;
  createdAt: string;
}

interface DetailResponse {
  order: DetailOrder;
  flag: DetailFlag | null;
  messages: DetailMessage[];
}

function buildTrackingUrl(o: {
  trackingUrl: string | null;
  trackingNumber: string | null;
}): string | null {
  if (o.trackingUrl) return o.trackingUrl;
  if (o.trackingNumber) {
    return `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(o.trackingNumber)}`;
  }
  return null;
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FlagsClient({
  role,
  currentUserId,
}: {
  role: Role;
  currentUserId: string;
}) {
  return (
    <Suspense fallback={null}>
      <FlagsContent role={role} currentUserId={currentUserId} />
    </Suspense>
  );
}

function FlagsContent({
  role,
  currentUserId,
}: {
  role: Role;
  currentUserId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isStaff = role === "STAFF" || role === "SUPER_ADMIN";

  const urlFilter = searchParams.get("filter");
  const urlOrder = searchParams.get("order");

  const [showRed, setShowRed] = useState(urlFilter !== "yellow" && urlFilter !== "resolved");
  const [showYellow, setShowYellow] = useState(urlFilter !== "red" && urlFilter !== "resolved");
  const [showResolved, setShowResolved] = useState(urlFilter !== "red" && urlFilter !== "yellow");

  const [list, setList] = useState<FlagListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(urlOrder);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch list
  const fetchList = useCallback(async () => {
    setListLoading(true);
    try {
      const statuses: string[] = [];
      if (showRed) statuses.push("red");
      if (showYellow) statuses.push("yellow");
      if (showResolved) statuses.push("resolved");
      const qs = statuses.length > 0 ? `?status=${statuses.join(",")}` : "?status=none";
      const res = await fetch(`/api/flags${qs}`);
      const json = await res.json();
      if (json.success) setList(json.data);
      else setList([]);
    } catch {
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, [showRed, showYellow, showResolved]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Fetch detail
  const fetchDetail = useCallback(async (orderKey: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/flags/${encodeURIComponent(orderKey)}`);
      const json = await res.json();
      if (json.success) {
        setDetail(json.data);
      } else {
        setDetail(null);
        setDetailError(json.error || "Lỗi tải dữ liệu");
      }
    } catch (e) {
      setDetail(null);
      setDetailError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedKey) {
      fetchDetail(selectedKey);
    } else {
      setDetail(null);
    }
  }, [selectedKey, fetchDetail]);

  // Scroll chat xuống đáy khi có message mới
  useEffect(() => {
    if (detail?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [detail?.messages.length]);

  function handleSelect(orderKey: string) {
    setSelectedKey(orderKey);
    setErrorMsg(null);
    setDraft("");
    // Update URL (shallow) — không reload
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", orderKey);
    router.replace(`/flags?${params.toString()}`, { scroll: false });
  }

  async function handleSend() {
    if (!selectedKey || !draft.trim() || sending) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/flags/${encodeURIComponent(selectedKey)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error || "Lỗi gửi tin nhắn");
        return;
      }
      setDraft("");
      // Refetch detail + list để sync màu cờ
      await Promise.all([fetchDetail(selectedKey), fetchList()]);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function handleResolve() {
    if (!selectedKey || resolving) return;
    if (!confirm("Gỡ cờ đơn này? (Lịch sử chat vẫn được giữ)")) return;
    setResolving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/flags/${encodeURIComponent(selectedKey)}/resolve`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error || "Lỗi gỡ cờ");
        return;
      }
      await Promise.all([fetchDetail(selectedKey), fetchList()]);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  async function handleDelete() {
    if (!selectedKey || deleting) return;
    if (
      !confirm(
        "Xóa HẲN cờ + toàn bộ tin nhắn của đơn này?\n\nĐơn sẽ biến mất khỏi tab Đơn gắn cờ và không thể khôi phục.",
      )
    )
      return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/flags/${encodeURIComponent(selectedKey)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error || "Lỗi xóa cờ");
        return;
      }
      // Sau khi xóa: clear selection + refetch list
      setSelectedKey(null);
      setDetail(null);
      setDraft("");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("order");
      router.replace(
        `/flags${params.toString() ? `?${params.toString()}` : ""}`,
        { scroll: false },
      );
      await fetchList();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const filteredList = useMemo(() => list, [list]);
  const trackingUrl = detail
    ? buildTrackingUrl({
        trackingUrl: detail.order.trackingUrl,
        trackingNumber: detail.order.trackingNumber,
      })
    : null;

  const canResolve =
    isStaff &&
    detail?.flag &&
    detail.flag.currentColor !== null;
  const canDelete = isStaff && detail?.flag != null;

  return (
    <>
      <Topbar title="Đơn gắn cờ" subtitle="Quản lý" showSync={false} />

      <div
        className="flex gap-4"
        style={{ height: "calc(100vh - 180px)" }}
      >
        {/* Left panel — list */}
        <Card
          padding="none"
          className="w-[380px] shrink-0 flex flex-col overflow-hidden"
        >
          {/* Toggle filters */}
          <div
            className="px-4 py-3 border-b flex flex-wrap gap-3"
            style={{ borderColor: "var(--border)" }}
          >
            <FilterCheckbox
              label="Cờ đỏ"
              dotColor="#ef4444"
              checked={showRed}
              onChange={setShowRed}
            />
            <FilterCheckbox
              label="Cờ vàng"
              dotColor="#f59e0b"
              checked={showYellow}
              onChange={setShowYellow}
            />
            <FilterCheckbox
              label="Đã gỡ"
              dotColor="#6b7280"
              checked={showResolved}
              onChange={setShowResolved}
            />
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Đang tải...
              </div>
            ) : filteredList.length === 0 ? (
              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Chưa có đơn nào.
              </div>
            ) : (
              filteredList.map((item) => (
                <FlagListRow
                  key={item.flagId}
                  item={item}
                  selected={item.orderUniqueKey === selectedKey}
                  isStaff={isStaff}
                  onClick={() => handleSelect(item.orderUniqueKey)}
                />
              ))
            )}
          </div>
        </Card>

        {/* Right panel — detail + chat */}
        <Card padding="none" className="flex-1 flex flex-col overflow-hidden">
          {!selectedKey ? (
            <div
              className="flex-1 flex items-center justify-center text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Chọn một đơn ở bên trái để xem hội thoại
            </div>
          ) : detailLoading ? (
            <div
              className="flex-1 flex items-center justify-center text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Đang tải...
            </div>
          ) : detailError ? (
            <div
              className="flex-1 flex items-center justify-center text-sm"
              style={{ color: "#fca5a5" }}
            >
              {detailError}
            </div>
          ) : detail ? (
            <>
              {/* Header: order info */}
              <div
                className="px-5 py-4 border-b flex items-start justify-between gap-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1">
                  <InfoRow label="Mã đơn" value={detail.order.orderId} />
                  <InfoRow
                    label="Khách hàng"
                    value={detail.order.customerName ?? detail.order.customerId}
                  />
                  <InfoRow
                    label="Sản phẩm"
                    value={detail.order.productName ?? detail.order.productId}
                  />
                  <InfoRow
                    label="Tracking"
                    value={
                      detail.order.trackingNumber ? (
                        trackingUrl ? (
                          <a
                            href={trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                            style={{ color: "var(--accent)" }}
                          >
                            {detail.order.trackingNumber}
                          </a>
                        ) : (
                          detail.order.trackingNumber
                        )
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )
                    }
                  />
                </div>
                <div className="flex flex-col items-end gap-2">
                  {detail.flag ? (
                    <FlagBadge color={detail.flag.currentColor} />
                  ) : (
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Chưa gắn cờ
                    </span>
                  )}
                  <div className="flex gap-2">
                    {canResolve && (
                      <button
                        onClick={handleResolve}
                        disabled={resolving || deleting}
                        className="btn btn-secondary text-xs"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          flag_circle
                        </span>
                        {resolving ? "Đang gỡ..." : "Gỡ cờ"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={handleDelete}
                        disabled={deleting || resolving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: "rgba(239, 68, 68, 0.15)",
                          color: "#fca5a5",
                        }}
                        title="Xóa hẳn cờ + toàn bộ tin nhắn của đơn này"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          delete_forever
                        </span>
                        {deleting ? "Đang xóa..." : "Xóa hẳn"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat messages */}
              <div
                className="flex-1 overflow-y-auto p-5 space-y-3"
                style={{ backgroundColor: "var(--bg-primary)" }}
              >
                {detail.messages.length === 0 ? (
                  <div
                    className="text-center text-sm py-8"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên để gắn cờ đơn này.
                  </div>
                ) : (
                  detail.messages.map((m) => (
                    <ChatBubble
                      key={m.id}
                      message={m}
                      isMine={m.userId === currentUserId}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                className="border-t p-3"
                style={{ borderColor: "var(--border)" }}
              >
                {errorMsg && (
                  <div
                    className="mb-2 px-3 py-1.5 text-xs rounded"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.15)",
                      color: "#fca5a5",
                    }}
                  >
                    {errorMsg}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"
                    rows={2}
                    className="filter-input flex-1 resize-none"
                    style={{ minHeight: "44px" }}
                    disabled={sending}
                  />
                  <Button
                    variant="primary"
                    icon="send"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="shrink-0"
                  >
                    {sending ? "Đang gửi..." : "Gửi"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function FilterCheckbox({
  label,
  dotColor,
  checked,
  onChange,
}: {
  label: string;
  dotColor: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-current"
      />
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
    </label>
  );
}

function FlagListRow({
  item,
  selected,
  isStaff,
  onClick,
}: {
  item: FlagListItem;
  selected: boolean;
  isStaff: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b transition-colors"
      style={{
        borderColor: "var(--border)",
        backgroundColor: selected ? "var(--accent-bg)" : "transparent",
      }}
    >
      <div className="flex items-start gap-3">
        <FlagDot color={item.currentColor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {item.orderId}
            </p>
            <span
              className="text-[10px] shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {relativeTime(item.lastMessageAt)}
            </span>
          </div>
          <p
            className="text-xs truncate mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {isStaff && item.customerName
              ? `${item.customerName} · ${item.productName ?? "—"}`
              : item.productName ?? "—"}
          </p>
          {item.trackingNumber && (
            <p
              className="text-[11px] truncate mt-0.5 font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              {item.trackingNumber}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function FlagDot({ color }: { color: FlagColor }) {
  const bg =
    color === "red" ? "#ef4444" : color === "yellow" ? "#f59e0b" : "#6b7280";
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5"
      style={{ backgroundColor: `${bg}20` }}
    >
      <span
        className="material-symbols-outlined text-[16px]"
        style={{ color: bg, fontVariationSettings: '"FILL" 1' }}
      >
        flag
      </span>
    </span>
  );
}

function FlagBadge({ color }: { color: FlagColor }) {
  if (color === null) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
        style={{
          backgroundColor: "rgba(107, 114, 128, 0.15)",
          color: "#9ca3af",
        }}
      >
        <span className="material-symbols-outlined text-[14px]">check_circle</span>
        Đã gỡ cờ
      </span>
    );
  }
  const bg = color === "red" ? "#ef4444" : "#f59e0b";
  const label = color === "red" ? "Cờ đỏ" : "Cờ vàng";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
      style={{
        backgroundColor: `${bg}20`,
        color: bg,
      }}
    >
      <span
        className="material-symbols-outlined text-[14px]"
        style={{ fontVariationSettings: '"FILL" 1' }}
      >
        flag
      </span>
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium mt-0.5"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

function ChatBubble({
  message,
  isMine,
}: {
  message: DetailMessage;
  isMine: boolean;
}) {
  const isCustomer = message.userRole === "CUSTOMER";
  const accentColor = isCustomer ? "#f59e0b" : "#ef4444";

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[70%]">
        <div
          className={`flex items-center gap-2 text-[11px] mb-1 ${isMine ? "justify-end" : "justify-start"}`}
          style={{ color: "var(--text-muted)" }}
        >
          <span className="font-semibold" style={{ color: accentColor }}>
            {message.userName}
          </span>
          <span>·</span>
          <span>{formatBubbleTime(message.createdAt)}</span>
        </div>
        <div
          className="px-3.5 py-2 rounded-lg text-sm whitespace-pre-wrap break-words"
          style={{
            backgroundColor: isMine ? "var(--accent-bg)" : "var(--bg-secondary)",
            color: "var(--text-primary)",
            borderLeft: !isMine ? `3px solid ${accentColor}` : undefined,
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
