import { diagnoseSpa } from "@/lib/gecko/gecko-client";
import { getProviderSetting } from "@/lib/db/settings";

/**
 * POST /api/gecko/diagnose
 *
 * Run step-by-step connection diagnostics against the configured Gecko device.
 * Accepts optional { host } in body; falls back to stored/env config.
 */
export async function POST(request: Request) {
  let host: string | undefined;

  try {
    const body = await request.json();
    host = body?.host;
  } catch {
    // no body — use stored config
  }

  if (!host) {
    const setting = await getProviderSetting("gecko");
    const config = setting.config as unknown as { host?: string };
    host = config?.host ?? process.env.GECKO_HOST;
  }

  if (!host) {
    return Response.json(
      { error: "Keine IP-Adresse konfiguriert" },
      { status: 400 }
    );
  }

  try {
    const result = await diagnoseSpa(host.trim());
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Diagnose fehlgeschlagen" },
      { status: 500 }
    );
  }
}
