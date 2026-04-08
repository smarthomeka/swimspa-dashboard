import { geckoService } from "@/lib/gecko/service";

/**
 * GET /api/gecko/status
 *
 * Returns the current Gecko connection status, including
 * auth state, MQTT connection, last received state, etc.
 */

export async function GET() {
  const status = await geckoService.getStatus();
  return Response.json(status);
}
