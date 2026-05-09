/**
 * One-shot script: tạo SUPER_ADMIN đầu tiên.
 * Idempotent: skip nếu username đã tồn tại.
 *
 * Local:
 *   SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD=pass SEED_ADMIN_NAME="Super Admin" \
 *     npx tsx --env-file=.env.local scripts/seed-admin.ts
 *
 * Railway shell: set 3 env vars trong Railway service rồi chạy `npx tsx scripts/seed-admin.ts`.
 *
 * Lưu ý: sau khi chạy thành công, anh nên unset env SEED_ADMIN_PASSWORD trên Railway
 * để tránh lộ password trong logs.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Super Admin";

  if (!username || !password) {
    console.error(
      "❌ Thiếu env SEED_ADMIN_USERNAME hoặc SEED_ADMIN_PASSWORD",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("❌ Password phải >= 8 ký tự");
    process.exit(1);
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    console.log(`✓ User "${username}" đã tồn tại, không tạo lại.`);
    process.exit(0);
  }

  const id = randomBytes(12).toString("hex");
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id,
    username,
    passwordHash,
    name,
    role: "SUPER_ADMIN",
  });

  console.log(`✓ Đã tạo SUPER_ADMIN: ${username} (id=${id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
