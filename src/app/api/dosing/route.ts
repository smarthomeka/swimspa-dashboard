import { NextRequest, NextResponse } from "next/server";
import { getDosingLogs, insertDosingLog, deleteDosingLog } from "@/lib/db/queries";

const CHEMICALS = [
  "tubhub Bromine Granules",
  "hth Spa Brom Tabs",
  "hth Spa Schock-Sauerstoff",
  "Armstark PH+",
  "Armstark PH-",
  "SpaLine Calcium+",
];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const chemical = searchParams.get("chemical") || undefined;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = getDosingLogs(since, chemical);
  return NextResponse.json({ logs, chemicals: CHEMICALS });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chemical, amountMl, notes, timestamp } = body;

  if (!chemical || typeof amountMl !== "number" || amountMl <= 0) {
    return NextResponse.json(
      { error: "chemical and positive amountMl are required" },
      { status: 400 }
    );
  }

  if (!CHEMICALS.includes(chemical)) {
    return NextResponse.json(
      { error: "Unknown chemical" },
      { status: 400 }
    );
  }

  const entry = insertDosingLog({
    chemical,
    amountMl,
    notes: notes || null,
    timestamp: timestamp || new Date().toISOString(),
  });

  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  deleteDosingLog(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
