import { NextRequest } from "next/server";
import { getAllSettings, upsertProviderSetting, type Provider } from "@/lib/db/settings";
import { geckoService } from "@/lib/gecko/service";

const VALID_PROVIDERS = new Set(["gecko", "labcom", "shelly", "blueconnect", "spa"]);

export async function GET() {
  return Response.json(await getAllSettings());
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { provider, enabled, config } = body;

  if (!provider || !VALID_PROVIDERS.has(provider)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (typeof enabled !== "boolean") {
    return Response.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  if (!config || typeof config !== "object") {
    return Response.json({ error: "config must be an object" }, { status: 400 });
  }

  await upsertProviderSetting(provider as Provider, enabled, config);

  // When spa settings change (poll interval), restart Gecko polling with new interval
  if (provider === "spa" && config.pollInterval !== undefined) {
    geckoService.restartPolling().catch((err) =>
      console.error("[Settings] Gecko restart failed:", err instanceof Error ? err.message : err)
    );
  }

  return Response.json({ ok: true });
}
