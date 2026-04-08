import { geckoService } from "@/lib/gecko/service";

/**
 * GET /api/gecko/status
 *
 * Returns the current Gecko connection/polling status.
 */

export async function GET() {
  const status = await geckoService.getStatus();
  return Response.json(status);
}
