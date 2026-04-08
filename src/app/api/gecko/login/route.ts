import { loginWithCredentials } from "@/lib/gecko/api";
import { geckoService } from "@/lib/gecko/service";

/**
 * POST /api/gecko/login
 *
 * Direct credential login — exchanges email/password for tokens
 * via Auth0 Resource Owner Password Grant, then auto-discovers
 * vessels and connects to MQTT.
 */

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return Response.json(
      { error: "E-Mail und Passwort erforderlich" },
      { status: 400 }
    );
  }

  try {
    const tokens = await loginWithCredentials(email, password);
    await geckoService.saveTokens(tokens);
    await geckoService.discoverVessels();

    try {
      await geckoService.connect();
    } catch (connectErr) {
      console.error("[Gecko] Auto-connect after login failed:", connectErr);
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login fehlgeschlagen";
    return Response.json({ error: message }, { status: 401 });
  }
}
