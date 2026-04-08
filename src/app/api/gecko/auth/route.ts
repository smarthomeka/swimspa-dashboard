import { NextRequest } from "next/server";
import { buildAuthorizeUrl, generatePkce, generateState } from "@/lib/gecko/api";

/**
 * GET /api/gecko/auth
 *
 * Starts the Gecko OAuth2 + PKCE flow.
 * Returns a JSON object with the authorize URL and stores PKCE
 * verifier + state in a secure cookie for the callback.
 */

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/gecko/callback`;

  const { verifier, challenge } = generatePkce();
  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl(redirectUri, state, challenge);

  // Store PKCE verifier + state in a cookie for the callback to verify
  const cookieValue = JSON.stringify({ verifier, state });
  const response = Response.json({ url: authorizeUrl });
  response.headers.set(
    "Set-Cookie",
    `gecko_pkce=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
  return response;
}
