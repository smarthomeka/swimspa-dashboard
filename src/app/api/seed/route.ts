import { seedMockData, clearAllData } from "@/lib/db/seed";

export async function POST() {
  await seedMockData(true);
  return Response.json({ ok: true, message: "Testdaten wurden geladen." });
}

export async function DELETE() {
  await clearAllData();
  return Response.json({ ok: true, message: "Alle Daten wurden gelöscht." });
}
