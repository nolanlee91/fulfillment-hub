import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flags, flagMessages, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

interface RouteContext {
  params: Promise<{ orderUniqueKey: string }>;
}

const MessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

/**
 * POST /api/flags/[orderUniqueKey]/messages
 *  body: { content }
 *
 * Append tin nhắn. Tự động:
 *  - Tạo flag mới nếu chưa có (createdBy=user, color theo role).
 *  - Revive flag nếu đã resolved (clear resolved fields, set color theo role).
 *  - Update currentColor + lastMessageAt nếu flag đang active.
 *
 * CUSTOMER: 403 nếu order không thuộc customerId của họ.
 */
export const POST = withAuth<RouteContext>(async (req, user, ctx) => {
  try {
    const { orderUniqueKey } = await ctx.params;
    const body = await req.json();
    const { content } = MessageSchema.parse(body);

    const orderRows = await db
      .select({ uniqueKey: orders.uniqueKey, customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.uniqueKey, orderUniqueKey))
      .limit(1);
    if (orderRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy đơn" },
        { status: 404 },
      );
    }
    const order = orderRows[0];

    if (user.role === "CUSTOMER") {
      if (!user.customerId || order.customerId !== user.customerId) {
        return NextResponse.json(
          { success: false, error: "Không có quyền truy cập đơn này" },
          { status: 403 },
        );
      }
    }

    const color: "red" | "yellow" = user.role === "CUSTOMER" ? "yellow" : "red";
    const now = new Date();

    const existing = await db
      .select({ id: flags.id })
      .from(flags)
      .where(eq(flags.orderUniqueKey, orderUniqueKey))
      .limit(1);

    let flagId: string;
    if (existing.length === 0) {
      flagId = randomUUID();
      await db.insert(flags).values({
        id: flagId,
        orderUniqueKey,
        currentColor: color,
        createdBy: user.id,
        createdAt: now,
        lastMessageAt: now,
      });
    } else {
      flagId = existing[0].id;
      await db
        .update(flags)
        .set({
          currentColor: color,
          resolvedAt: null,
          resolvedBy: null,
          lastMessageAt: now,
        })
        .where(eq(flags.id, flagId));
    }

    const messageId = randomUUID();
    await db.insert(flagMessages).values({
      id: messageId,
      flagId,
      userId: user.id,
      userRole: user.role,
      userName: user.name,
      content,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: messageId,
        flagId,
        userId: user.id,
        userRole: user.role,
        userName: user.name,
        content,
        createdAt: now,
        currentColor: color,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
});
