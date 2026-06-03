import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, boxes, products, batches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { withAuth } from "@/lib/auth/api-guard";
import { normalizeProvince } from "@/lib/geo/province";

export const maxDuration = 60;

const FIXED_EMAIL = "tracking@kdexpress.ca";
const FIXED_IMPERIAL = "imperial";
const LB_TO_G = 453.592;
const IN_TO_CM = 2.54;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface OrderRow {
  orderId: string;
  name: string | null;
  titleName: string | null;
  lastName: string | null;
  titleDept: string | null;
  companyName: string | null;
  additionalAddressInfo: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  zipcode: string | null;
  country: string | null;
  phone: string | null;
  quantity: number;
  boxCode: string | null;
  productId: string;
  codAmount: string | null;
}

interface BoxInfo {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  emptyWeightLb: number;
}

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function normalizePostalCode(z: string | null): string {
  if (!z) return "";
  return z.replace(/\s+/g, "").toUpperCase();
}

function buildClickshipXlsx(
  ordersList: OrderRow[],
  boxMap: Record<string, BoxInfo>,
  productMap: Record<string, number>,
): { buffer: Promise<ArrayBuffer>; missingBox: string[]; missingProduct: string[] } {
  const missingBox: string[] = [];
  const missingProduct: string[] = [];
  const dataRows: (string | number)[][] = [];

  for (const o of ordersList) {
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
      normalizeProvince(o.province),
      normalizePostalCode(o.zipcode),
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
  for (const row of dataRows) sheet.addRow(row);
  sheet.columns.forEach((col) => {
    col.width = 16;
  });

  return {
    buffer: workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>,
    missingBox,
    missingProduct,
  };
}

function buildEstCsv(
  ordersList: OrderRow[],
  boxMap: Record<string, BoxInfo>,
  productMap: Record<string, number>,
): { csv: string; missingBox: string[]; missingProduct: string[]; missingCod: string[] } {
  const missingBox: string[] = [];
  const missingProduct: string[] = [];
  const missingCod: string[] = [];

  const headers = [
    "#RECORDTYPE", "#ORDERID", "#CLIENTID", "#TITLENAME", "#FIRSTNAME", "#LASTNAME",
    "#TITLE/DEPT", "#COMPANYNAME", "#ADDITIONALADDRESSINFORMATION", "#ADDRESSLINE1",
    "#ADDRESSLINE2", "#CITY", "#PROVINCE/STATE", "#POSTAL/ZIPCODE", "#COUNTRYCODE",
    "#PHONENUMBER", "#FAXNUMBER", "#EMAILADDRESS", "#WEIGHT", "#SERVICE", "#LENGTH",
    "#WIDTH", "#HEIGHT", "#DOCUMENTINDICATOR", "#OVERSIZEINDICATOR",
    "#DELIVERYCONFIRMATIONINDICATOR", "#SIGNATUREINDICATOR", "#USPOSTALBOXINDICATOR",
    "#DONOTSAFEDROPINDICATOR", "#CARDFORPICKUPINDICATOR", "#PROOFOFAGEREQUIRED18",
    "#PROOFOFAGEREQUIRED19", "#LEAVEATDOORINDICATOR", "#REGISTEREDINDICATOR",
    "#PROOFOFIDENTITYINDICATOR", "#ADVICEOFRECEIPTINDICATOR", "#DELIVERTOPOSTOFFICE",
    "#DESTINATIONPOSTOFFICE", "#EVENINGINDICATOR", "#SATURDAYINDICATOR",
    "#NOTIFYRECIPIENT", "#INSUREDAMOUNT", "#CODVALUE", "#METHODOFCOLLECTION",
  ];

  const lines: string[] = [headers.join(",")];

  for (const o of ordersList) {
    if (!o.boxCode || !boxMap[o.boxCode]) {
      missingBox.push(o.orderId);
      continue;
    }
    if (!productMap[o.productId]) {
      missingProduct.push(`${o.orderId} (${o.productId})`);
      continue;
    }
    const codAmt = o.codAmount !== null ? Number(o.codAmount) : 0;
    if (!codAmt || codAmt <= 0) {
      missingCod.push(o.orderId);
      continue;
    }

    const box = boxMap[o.boxCode];
    const unitLb = productMap[o.productId];
    const weightG = Math.round((box.emptyWeightLb + o.quantity * unitLb) * LB_TO_G);
    const lengthCm = Math.round(box.lengthIn * IN_TO_CM);
    const widthCm = Math.round(box.widthIn * IN_TO_CM);
    const heightCm = Math.round(box.heightIn * IN_TO_CM);

    const fields: (string | number)[] = [
      3,                              // #RECORDTYPE
      o.orderId,                      // #ORDERID
      o.name || "",                   // #CLIENTID = tên khách
      o.titleName || "",              // #TITLENAME
      o.name || "",                   // #FIRSTNAME
      o.lastName || "",               // #LASTNAME
      o.titleDept || "",              // #TITLE/DEPT
      o.companyName || "",            // #COMPANYNAME
      o.additionalAddressInfo || "",  // #ADDITIONALADDRESSINFORMATION
      o.addressLine1 || "",           // #ADDRESSLINE1
      o.addressLine2 || "",           // #ADDRESSLINE2
      o.city || "",                   // #CITY
      normalizeProvince(o.province),  // #PROVINCE/STATE (2-letter code)
      normalizePostalCode(o.zipcode), // #POSTAL/ZIPCODE (no spaces, uppercase)
      "CA",                           // #COUNTRYCODE
      o.phone || "",                  // #PHONENUMBER
      "", "",                         // #FAXNUMBER, #EMAILADDRESS
      weightG,                        // #WEIGHT (gram)
      967,                            // #SERVICE
      lengthCm,                       // #LENGTH (cm)
      widthCm,                        // #WIDTH (cm)
      heightCm,                       // #HEIGHT (cm)
      // 19 cột rỗng giữa #HEIGHT và #CODVALUE:
      // #DOCUMENTINDICATOR..#INSUREDAMOUNT (cột 24..42)
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      codAmt,                         // #CODVALUE (cột 43)
      1,                              // #METHODOFCOLLECTION (cột 44)
    ];

    lines.push(fields.map(csvEscape).join(","));
  }

  // BOM cho Excel mở UTF-8 đúng
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  return { csv, missingBox, missingProduct, missingCod };
}

export const GET = withAuth<RouteContext>(
  async (_req, _user, ctx) => {
  try {
    const { id: batchId } = await ctx.params;

    // 1. Load batch để biết platform
    const [batch] = await db
      .select({ id: batches.id, platform: batches.platform })
      .from(batches)
      .where(eq(batches.id, batchId));

    if (!batch) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy batch ${batchId}` },
        { status: 404 },
      );
    }

    // 2. Load orders trong batch
    const ordersInBatch: OrderRow[] = await db
      .select({
        orderId: orders.orderId,
        name: orders.name,
        titleName: orders.titleName,
        lastName: orders.lastName,
        titleDept: orders.titleDept,
        companyName: orders.companyName,
        additionalAddressInfo: orders.additionalAddressInfo,
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
        codAmount: orders.codAmount,
      })
      .from(orders)
      .where(eq(orders.batchId, batchId));

    if (ordersInBatch.length === 0) {
      return NextResponse.json(
        { success: false, error: `Batch ${batchId} không có đơn nào` },
        { status: 404 },
      );
    }

    // 3. Load Box Master + Product Master
    const boxList = await db.select().from(boxes);
    const boxMap: Record<string, BoxInfo> = {};
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

    // 4. Branch theo platform (default CLICKSHIP cho batch cũ chưa có platform)
    const platform = batch.platform || "CLICKSHIP";

    if (platform === "EST") {
      const { csv, missingBox, missingProduct, missingCod } = buildEstCsv(
        ordersInBatch,
        boxMap,
        productMap,
      );
      if (missingBox.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${missingBox.length} đơn thiếu box: ${missingBox.slice(0, 3).join(", ")}${missingBox.length > 3 ? "..." : ""}`,
          },
          { status: 400 },
        );
      }
      if (missingProduct.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${missingProduct.length} đơn thiếu unit_weight: ${missingProduct.slice(0, 3).join(", ")}${missingProduct.length > 3 ? "..." : ""}`,
          },
          { status: 400 },
        );
      }
      if (missingCod.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${missingCod.length} đơn COD thiếu số tiền: ${missingCod.slice(0, 3).join(", ")}${missingCod.length > 3 ? "..." : ""}`,
          },
          { status: 400 },
        );
      }
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="EST_${batchId}.csv"`,
        },
      });
    }

    // CLICKSHIP (default)
    const { buffer, missingBox, missingProduct } = buildClickshipXlsx(
      ordersInBatch,
      boxMap,
      productMap,
    );
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
    const xlsxBuffer = await buffer;
    return new NextResponse(new Uint8Array(xlsxBuffer), {
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
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
