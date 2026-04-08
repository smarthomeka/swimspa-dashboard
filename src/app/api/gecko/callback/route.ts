import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/gecko/api";
import { geckoService } from "@/lib/gecko/service";

/**
 * GET /api/gecko/callback?code=...&state=...
 *
 * OAuth2 callback from Auth0. Exchanges the authorization code for tokens,
 * stores them, discovers vessels, and redirects to settings page.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/einstellungen?gecko_error=${encodeURIComponent(errorDesc ?? error)}`, request.nextUrl.origin)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/einstellungen?gecko_error=missing_code", request.nextUrl.origin)
    );
  }

  // Retrieve PKCE verifier from cookie
  const pkceCookie = request.cookies.get("gecko_pkce")?.value;
  if (!pkceCookie) {
    return NextResponse.redirect(
      new URL("/einstellungen?gecko_error=missing_pkce_cookie", request.nextUrl.origin)
    );
  }

  let verifier: string;
  let expectedState: string;
  try {
    const parsed = JSON.parse(decodeURIComponent(pkceCookie));
    verifier = parsed.verifier;
    expectedState = parsed.state;
  } catch {
    return NextResponse.redirect(
      new URL("/einstellungen?gecko_error=invalid_pkce_cookie", request.nextUrl.origin)
    );
  }

  if (state !== expectedState) {
    return NextResponse.redirect(
      new URL("/einstellungen?gecko_error=state_mismatch", request.nextUrl.origin)
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/gecko/callback`;

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri, verifier);
    await geckoService.saveTokens(tokens);

    // Discover vessels and auto-connect
    await geckoService.discoverVessels();

    // Try to connect
    try {
      await geckoService.connect();
    } catch (connectErr) {
      console.error("[Gecko] Auto-connect after OAuth failed:", connectErr);
      // Non-fatal — user can manually connect later
    }

    const response = NextResponse.redirect(
      new URL("/einstellungen?gecko_success=true", request.nextUrl.origin)
    );
    // Clear the PKCE cookie
    response.headers.set(
      "Set-Cookie",
      "gecko_pkce=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    );
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/einstellungen?gecko_error=${encodeURIComponent(msg)}`, request.nextUrl.origin)
    );
  }
}
