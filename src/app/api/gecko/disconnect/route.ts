import { geckoService } from "@/lib/gecko/service";

/**
 * POST /api/gecko/disconnect
 *
 * Disconnects the MQTT connection to the Gecko spa.
 */

export async function POST() {
  geckoService.disconnect();
  return Response.json({ ok: true });
}
