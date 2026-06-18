/**
 * Validate postal code Canada theo quy tắc format cứng (không cần bảng tra).
 *
 * Format: A1A 1A1 — xen kẽ Chữ-Số-Chữ Số-Chữ-Số.
 *   - Vị trí 1,3,5 (index 0,2,4) = CHỮ cái hợp lệ
 *   - Vị trí 2,4,6 (index 1,3,5) = SỐ
 *   - Chữ KHÔNG dùng: D F I O Q U (→ O không bao giờ hợp lệ trong postal Canada)
 *
 * Mục đích: bắt lỗi khách nhầm O↔0 (và I↔1, sai cấu trúc) ngay khi sync,
 * không phải chờ ClickShip báo lỗi.
 */

// 20 chữ hợp lệ (loại D F I O Q U). W,Z chỉ cấm ở vị trí đầu nhưng để đơn giản
// + tránh báo nhầm, chấp nhận W,Z ở mọi vị trí chữ.
const VALID_LETTERS = new Set("ABCEGHJKLMNPRSTVWXYZ".split(""));

export interface PostalCheck {
  ok: boolean;
  reason?: string;     // mô tả lỗi (tiếng Việt) khi !ok
  suggestion?: string; // gợi ý sửa nếu sửa được thành postal hợp lệ
}

function normalize(raw: string): string {
  return String(raw || "").toUpperCase().replace(/[\s-]/g, "");
}

const IS_LETTER_POS = [true, false, true, false, true, false];

/** Kiểm tra 1 chuỗi 6 ký tự đã chuẩn hóa có đúng format ANANAN không. */
function isValidShape(p: string): boolean {
  if (p.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const ch = p[i];
    if (IS_LETTER_POS[i]) {
      if (!VALID_LETTERS.has(ch)) return false;
    } else if (!/[0-9]/.test(ch)) {
      return false;
    }
  }
  return true;
}

export function checkCanadianPostal(raw: string): PostalCheck {
  const p = normalize(raw);

  // Rỗng → để missing-field check khác xử lý, không báo trùng.
  if (!p) return { ok: true };

  // Zip kiểu Mỹ/quốc tế thuần số (5 hoặc 9 số) → bỏ qua, không phải postal Canada.
  if (/^\d{5}(\d{4})?$/.test(p)) return { ok: true };

  if (p.length !== 6) {
    return {
      ok: false,
      reason: `Postal code phải 6 ký tự (đang có ${p.length}): "${raw}"`,
    };
  }

  const problems: string[] = [];
  const fixed = p.split("");

  for (let i = 0; i < 6; i++) {
    const ch = p[i];
    const pos = i + 1;
    if (IS_LETTER_POS[i]) {
      // Phải là chữ hợp lệ
      if (/[0-9]/.test(ch)) {
        problems.push(
          ch === "0"
            ? `vị trí ${pos} là số 0 nhưng phải là CHỮ (có thể nhầm 0↔O)`
            : `vị trí ${pos} là số ${ch} nhưng phải là chữ`,
        );
      } else if (!VALID_LETTERS.has(ch)) {
        problems.push(
          `vị trí ${pos} dùng chữ "${ch}" không hợp lệ (postal Canada không dùng D,F,I,O,Q,U)`,
        );
      }
    } else {
      // Phải là số
      if (/[A-Z]/.test(ch)) {
        if (ch === "O") {
          fixed[i] = "0";
          problems.push(`vị trí ${pos} là chữ O nhưng phải là SỐ → nhầm O↔0`);
        } else if (ch === "I") {
          fixed[i] = "1";
          problems.push(`vị trí ${pos} là chữ I nhưng phải là số → có thể nhầm I↔1`);
        } else {
          problems.push(`vị trí ${pos} là chữ "${ch}" nhưng phải là số`);
        }
      }
    }
  }

  if (problems.length === 0) return { ok: true };

  // Nếu sửa O→0 / I→1 ra postal hợp lệ → kèm gợi ý (format có dấu cách).
  const fixedStr = fixed.join("");
  const suggestion =
    fixedStr !== p && isValidShape(fixedStr)
      ? `${fixedStr.slice(0, 3)} ${fixedStr.slice(3)}`
      : undefined;

  return {
    ok: false,
    reason: `Postal sai: ${problems.join("; ")}`,
    suggestion,
  };
}
