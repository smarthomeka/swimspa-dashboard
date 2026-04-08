import { geckoService } from "@/lib/gecko/service";

/**
 * POST /api/gecko/disconnect
 *
 * Stops Gecko polling.
 */

export async function POST() {
  geckoService.stopPolling();
  return Response.json({ ok: true });
}
