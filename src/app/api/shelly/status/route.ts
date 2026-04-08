import { shellyService } from "@/lib/shelly/service";

/**
 * GET /api/shelly/status
 *
 * Returns the current Shelly 3EM service status including
 * configuration state, polling state, and last reading.
 */

export async function GET() {
  const status = await shellyService.getStatus();
  return Response.json(status);
}
