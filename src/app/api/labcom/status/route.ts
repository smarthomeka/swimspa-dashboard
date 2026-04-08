import { labcomService } from "@/lib/labcom/service";

/**
 * GET /api/labcom/status
 *
 * Returns the current status of the Labcom PoolLab integration.
 */

export async function GET() {
  const status = await labcomService.getStatus();
  return Response.json(status);
}
