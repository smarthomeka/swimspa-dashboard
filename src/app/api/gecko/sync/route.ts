import { geckoService } from "@/lib/gecko/service";

/**
 * POST /api/gecko/sync
 *
 * Triggers a sync with the Gecko spa.
 * If already connected, requests fresh state.
 * If not connected, does a connect → get state → keep connection alive.
 */

export async function POST() {
  try {
    const state = await geckoService.syncOnce();
    return Response.json({ ok: true, state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
