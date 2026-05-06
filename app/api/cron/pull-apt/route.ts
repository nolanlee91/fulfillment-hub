import { NextRequest, NextResponse } from "next/server";
import SftpClient from "ssh2-sftp-client";
import { db } from "@/lib/db";
import { trackingFiles } from "@/lib/db/schema";
import { parseAptFile } from "@/lib/carrier-tracking/parser-apt";
import { processAptEvents } from "@/lib/carrier-tracking/processor";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILES_PER_RUN = 20;

async function handler(req: NextRequest) {
  // Auth: Bearer CRON_SECRET
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET chưa setup trên server" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const host = process.env.APT_SFTP_HOST;
  const port = Number(process.env.APT_SFTP_PORT || "22");
  const user = process.env.APT_SFTP_USER;
  const password = process.env.APT_SFTP_PASSWORD;
  const folder = process.env.APT_SFTP_FOLDER || "/APT";

  if (!host || !user || !password) {
    return NextResponse.json(
      { success: false, error: "Thiếu env var SFTP (HOST/USER/PASSWORD)" },
      { status: 500 },
    );
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host,
      port,
      username: user,
      password,
      readyTimeout: 30_000,
    });

    const list = await sftp.list(folder);
    const files = list
      .filter((f) => f.type === "-")
      .sort((a, b) => a.modifyTime - b.modifyTime);

    const processedRows = await db
      .select({ filename: trackingFiles.filename })
      .from(trackingFiles);
    const processedSet = new Set(processedRows.map((p) => p.filename));
    const pending = files.filter((f) => !processedSet.has(f.name));

    const toProcess = pending.slice(0, MAX_FILES_PER_RUN);

    if (toProcess.length === 0) {
      await sftp.end();
      return NextResponse.json({
        success: true,
        totalFiles: files.length,
        pending: 0,
        processed: 0,
        message: "Không có file mới",
      });
    }

    const totals = { events: 0, matched: 0, updated: 0, unmatched: 0 };
    let okCount = 0;
    let errCount = 0;
    const errorList: string[] = [];

    for (const f of toProcess) {
      try {
        const remotePath = `${folder.replace(/\/$/, "")}/${f.name}`;
        const buffer = (await sftp.get(remotePath)) as Buffer;
        const events = parseAptFile(buffer);

        if (events.length === 0) {
          await db
            .insert(trackingFiles)
            .values({ filename: f.name, source: "APT", totalRows: 0, totalUpdated: 0 })
            .onConflictDoNothing();
          okCount++;
          continue;
        }

        const result = await processAptEvents(events);
        await db
          .insert(trackingFiles)
          .values({
            filename: f.name,
            source: "APT",
            totalRows: result.totalEventsInFile,
            totalUpdated: result.totalUpdated,
          })
          .onConflictDoNothing();

        totals.events += result.totalEventsInFile;
        totals.matched += result.totalMatched;
        totals.updated += result.totalUpdated;
        totals.unmatched += result.totalUnmatched;
        okCount++;
      } catch (err) {
        errCount++;
        const msg = err instanceof Error ? err.message : String(err);
        errorList.push(`${f.name}: ${msg}`);
      }
    }

    await sftp.end();

    const remaining = pending.length - toProcess.length;
    return NextResponse.json({
      success: true,
      totalFiles: files.length,
      pending: pending.length,
      processed: okCount,
      errors: errCount,
      errorList: errorList.slice(0, 5),
      events: totals.events,
      matched: totals.matched,
      updated: totals.updated,
      unmatched: totals.unmatched,
      remainingNextRun: remaining,
      message: `Pull ${okCount} file (${totals.events} events, cập nhật ${totals.updated} đơn).${remaining > 0 ? ` Còn ${remaining} file pending lần sau.` : ""}`,
    });
  } catch (err) {
    try {
      await sftp.end();
    } catch {
      // ignore
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Cron pull-apt error:", err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
