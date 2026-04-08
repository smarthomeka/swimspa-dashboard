import { shellyService } from "@/lib/shelly/service";

/**
 * POST /api/shelly/sync
 *
 * Triggers an immediate sync with the Shelly 3EM device.
 * Fetches current power/energy readings and persists them to DB.
 * Also starts background polling if not already running.
 */

export async function POST() {
  try {
    const reading = await shellyService.syncOnce();
    // Start polling after successful sync
    shellyService.startPolling();
    return Response.json({ ok: true, reading });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
