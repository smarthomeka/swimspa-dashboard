import { geckoService } from "@/lib/gecko/service";

/**
 * POST /api/gecko/sync
 *
 * Triggers a one-shot sync with the Gecko spa via local network.
 */

export async function POST() {
  try {
    const reading = await geckoService.syncOnce();
    return Response.json({ ok: true, reading });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
