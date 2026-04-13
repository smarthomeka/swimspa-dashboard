import { readSpaStateDebug } from "@/lib/gecko/gecko-client";
import { getProviderSetting } from "@/lib/db/settings";

/**
 * GET /api/gecko/debug
 *
 * Returns raw status block data for debugging pump state parsing.
 */
export async function GET() {
  try {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as { host?: string };
    const host = config.host || process.env.GECKO_HOST;

    if (!host) {
      return Response.json({ error: "No Gecko host configured" }, { status: 400 });
    }

    const result = await readSpaStateDebug(host.trim());
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
