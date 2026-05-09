/**
 * One-shot endpoint: apply schema users/sessions + tạo SUPER_ADMIN đầu tiên.
 * XÓA endpoint này sau khi anh đã login thành công.
 *
 * Auth: Bearer CRON_SECRET (header) hoặc ?secret=... (query) — cùng secret với cron jobs.
 *
 * Cách gọi (1 trong 2):
 *
 *   POST với body JSON:
 *     curl -X POST "https://APP/api/admin/setup-auth" \
 *       -H "Authorization: Bearer $CRON_SECRET" \
 *       -H "Content-Type: application/json" \
 *       -d '{"username":"admin","password":"...","name":"Super Admin"}'
 *
 *   GET với query (tiện qua cron-job.org Execute Now):
 *     https://APP/api/admin/setup-auth?secret=...&username=admin&password=...&name=Super+Admin
 *
 * Idempotent:
 *   - Schema: chỉ tạo nếu chưa có (CREATE TABLE IF NOT EXISTS)
 *   - User: nếu username đã tồn tại → skip insert, trả `created: false`
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function checkSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const query = req.nextUrl.searchParams.get("secret");
  if (query && query === secret) return true;
  return false;
}

async function applySchema() {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'STAFF', 'CUSTOMER');
      END IF;
    END$$;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id           text PRIMARY KEY,
      username     text NOT NULL,
      password_hash text NOT NULL,
      name         text NOT NULL,
      role         user_role NOT NULL,
      customer_id  text REFERENCES customers(id),
      active       boolean NOT NULL DEFAULT true,
      created_at   timestamp NOT NULL DEFAULT now(),
      last_login_at timestamp
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username);
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id         text PRIMARY KEY,
      user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
  `);
}

async function ensureAdmin(username: string, password: string, name: string) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return { created: false, id: existing[0].id };
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
  return { created: true, id };
}

interface SetupInput {
  username: string;
  password: string;
  name?: string;
}

async function handle(req: NextRequest, input: SetupInput) {
  const username = input.username?.trim();
  const password = input.password;
  const name = (input.name ?? "Super Admin").trim();

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: "Thiếu username hoặc password" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: "Password phải >= 8 ký tự" },
      { status: 400 },
    );
  }

  await applySchema();
  const result = await ensureAdmin(username, password, name);

  return NextResponse.json({
    success: true,
    schemaApplied: true,
    user: {
      username,
      created: result.created,
      message: result.created
        ? "Đã tạo SUPER_ADMIN — anh có thể login ngay."
        : "Username này đã tồn tại, không tạo lại. Login bằng password cũ.",
    },
  });
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return unauthorized();
  const sp = req.nextUrl.searchParams;
  return handle(req, {
    username: sp.get("username") ?? "",
    password: sp.get("password") ?? "",
    name: sp.get("name") ?? undefined,
  });
}

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return unauthorized();
  let body: SetupInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  return handle(req, body);
}
