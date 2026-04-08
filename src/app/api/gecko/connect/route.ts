import { geckoService } from "@/lib/gecko/service";

/**
 * POST /api/gecko/connect
 *
 * Connect to a Gecko in.Touch 2 spa via its local network IP address.
 * Saves the IP, does an initial sync, and starts polling.
 */

export async function POST(request: Request) {
  const body = await request.json();
  const { host } = body as { host?: string };

  if (!host) {
    return Response.json(
      { error: "IP-Adresse erforderlich" },
      { status: 400 }
    );
  }

  try {
    await geckoService.saveHost(host);
    const reading = await geckoService.syncOnce();
    await geckoService.startPolling();
    return Response.json({ ok: true, reading });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Verbindung fehlgeschlagen";
    return Response.json({ error: message }, { status: 500 });
  }
}
