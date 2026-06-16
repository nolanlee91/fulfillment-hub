"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  className?: string;
}

/**
 * Phân trang số trang (có "…" khi nhiều trang) + nút trước/sau.
 * Phân trang ở client trên danh sách đã lọc — search/filter vẫn chạy server-side
 * trên toàn bộ dữ liệu nên tìm kiếm không bị giới hạn theo trang.
 */
export function Pagination({ page, totalPages, onPageChange, className = "" }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Tập trang cần hiện: 1, cuối, hiện tại ± 1.
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const shown = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const items: (number | "...")[] = [];
  let prev = 0;
  for (const p of shown) {
    if (p - prev > 1) items.push("...");
    items.push(p);
    prev = p;
  }

  return (
    <div className={`pagination ${className}`}>
      <button
        type="button"
        className="pagination-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
      </button>
      {items.map((it, i) =>
        it === "..." ? (
          <span key={`e${i}`} className="pagination-ellipsis">…</span>
        ) : (
          <button
            type="button"
            key={it}
            className={`pagination-btn${it === page ? " active" : ""}`}
            onClick={() => onPageChange(it)}
          >
            {it}
          </button>
        ),
      )}
      <button
        type="button"
        className="pagination-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
      </button>
    </div>
  );
}
