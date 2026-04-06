import { seedMockData, clearAllData } from "@/lib/db/seed";

export async function POST() {
  seedMockData(true);
  return Response.json({ ok: true, message: "Testdaten wurden geladen." });
}

export async function DELETE() {
  clearAllData();
  return Response.json({ ok: true, message: "Alle Daten wurden gelöscht." });
}
