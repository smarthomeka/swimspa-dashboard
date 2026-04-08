import { labcomService } from "@/lib/labcom/service";

/**
 * POST /api/labcom/sync
 *
 * Triggers an immediate sync with the Labcom PoolLab API.
 * Fetches water quality readings (pH, Bromine, Alkalinity) and persists them.
 * Also starts background polling if not already running.
 */

export async function POST() {
  try {
    const readings = await labcomService.syncOnce();
    labcomService.startPolling();
    return Response.json({ ok: true, readings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
