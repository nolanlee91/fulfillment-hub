import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, boxes, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";

export const maxDuration = 60;

const FIXED_EMAIL = "tracking@kdexpress.ca";
const FIXED_IMPERIAL = "imperial";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id: batchId } = await ctx.params;

    // 1. Load orders trong batch
    const ordersInBatch = await db
      .select({
        orderId: orders.orderId,
        name: orders.name,
        companyName: orders.companyName,
        addressLine1: orders.addressLine1,
        addressLine2: orders.addressLine2,
        city: orders.city,
        province: orders.province,
        zipcode: orders.zipcode,
        country: orders.country,
        phone: orders.phone,
        quantity: orders.quantity,
        boxCode: orders.boxCode,
        productId: orders.productId,
      })
      .from(orders)
      .where(eq(orders.batchId, batchId));

    if (ordersInBatch.length === 0) {
      return NextResponse.json(
        { success: false, error: `Batch ${batchId} không có đơn nào` },
        { status: 404 },
      );
    }

    // 2. Load Box Master + Product Master cho lookup weight
    const boxList = await db.select().from(boxes);
    const boxMap: Record<
      string,
      { lengthIn: number; widthIn: number; heightIn: number; emptyWeightLb: number }
    > = {};
    for (const b of boxList) {
      boxMap[b.code] = {
        lengthIn: Number(b.lengthIn),
        widthIn: Number(b.widthIn),
        heightIn: Number(b.heightIn),
        emptyWeightLb: Number(b.emptyWeightLb),
      };
    }

    const productList = await db.select().from(products);
    const productMap: Record<string, number> = {};
    for (const p of productList) {
      productMap[p.id] = Number(p.unitWeightLb || 0);
    }

    // 3. Build rows
    const missingBox: string[] = [];
    const missingProduct: string[] = [];

    const dataRows: (string | number)[][] = [];
    for (const o of ordersInBatch) {
      if (!o.boxCode || !boxMap[o.boxCode]) {
        missingBox.push(o.orderId);
        continue;
      }
      if (!productMap[o.productId]) {
        missingProduct.push(`${o.orderId} (${o.productId})`);
        continue;
      }

      const box = boxMap[o.boxCode];
      const unitWeight = productMap[o.productId];
      const totalWeight = +(box.emptyWeightLb + o.quantity * unitWeight).toFixed(2);

      dataRows.push([
        o.orderId,
        o.name || "",
        o.companyName || "",
        o.addressLine1 || "",
        o.addressLine2 || "",
        o.city || "",
        o.province || "",
        o.zipcode || "",
        o.country || "",
        o.phone || "",
        FIXED_EMAIL,
        box.lengthIn,
        box.widthIn,
        box.heightIn,
        totalWeight,
        FIXED_IMPERIAL,
      ]);
    }

    if (missingBox.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${missingBox.length} đơn thiếu box_code: ${missingBox.slice(0, 3).join(", ")}${missingBox.length > 3 ? "..." : ""}`,
        },
        { status: 400 },
      );
    }
    if (missingProduct.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${missingProduct.length} đơn thiếu unit_weight trong Product Master: ${missingProduct.slice(0, 3).join(", ")}${missingProduct.length > 3 ? "..." : ""}`,
        },
        { status: 400 },
      );
    }

    // 4. Tạo Excel với ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("ClickShip");

    const headers = [
      "Order ID",
      "Recipient Name",
      "Company Name",
      "Address Line 1",
      "Address Line 2",
      "City",
      "Province/State",
      "Zipcode",
      "Country",
      "Phone",
      "Email",
      "Length (in)",
      "Width (in)",
      "Height (in)",
      "Weight (lb)",
      "Imperial",
    ];

    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    for (const row of dataRows) {
      sheet.addRow(row);
    }

    // Auto-fit columns (rough)
    sheet.columns.forEach((col) => {
      col.width = 16;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clickship_${batchId}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Export error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
