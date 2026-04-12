import { geckoService } from "@/lib/gecko/service";

/**
 * GET /api/gecko/status
 *
 * Returns the current Gecko connection/polling status
 * including full spa reading with pumps, watercare, reminders, errors.
 */

export async function GET() {
  const status = await geckoService.getStatus();
  return Response.json(status);
}
