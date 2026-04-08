/**
 * Gecko in.Touch 2 REST API client.
 *
 * Handles Auth0 OAuth2 + PKCE authentication and the Gecko REST API
 * for account info, vessel discovery, and MQTT session creation.
 */

import { randomBytes, createHash } from "crypto";

// Auth0 configuration (from HA gecko integration — public client)
const AUTH0_DOMAIN = "https://gecko-prod.us.auth0.com";
const AUTH0_CLIENT_ID = "L81oh6hgUsvMg40TgTGoz4lxNy8eViM0";
const GECKO_API_BASE = "https://api.geckowatermonitor.com";

// ── PKCE helpers ──────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState(): string {
  return base64url(randomBytes(16));
}

// ── Auth0 URLs ────────────────────────────────────────────────────

export function buildAuthorizeUrl(
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: AUTH0_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    audience: `${GECKO_API_BASE}/`,
  });
  return `${AUTH0_DOMAIN}/authorize?${params}`;
}

// ── Token exchange ────────────────────────────────────────────────

export type GeckoTokens = {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<GeckoTokens> {
  const res = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: AUTH0_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth0 token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<GeckoTokens> {
  const res = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: AUTH0_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth0 token refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Gecko REST API ────────────────────────────────────────────────

async function geckoGet(path: string, accessToken: string) {
  const res = await fetch(`${GECKO_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gecko API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export type GeckoUserInfo = {
  sub: string;
};

export async function getUserInfo(accessToken: string): Promise<GeckoUserInfo> {
  const res = await fetch(`${AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Auth0 userinfo failed (${res.status})`);
  return res.json();
}

export type GeckoAccount = {
  accountId: string;
};

export async function getAccount(
  userId: string,
  accessToken: string
): Promise<GeckoAccount> {
  const data = await geckoGet(`/v2/user/${userId}`, accessToken);
  return { accountId: data.account?.accountId ?? data.accountId };
}

export type GeckoVessel = {
  vesselId: string;
  monitorId: string;
  name: string;
  type: string;
  protocolName?: string;
};

export async function getVessels(
  accountId: string,
  accessToken: string
): Promise<GeckoVessel[]> {
  const data = await geckoGet(
    `/v4/accounts/${accountId}/vessels`,
    accessToken
  );
  return data.vessels ?? data;
}

export type MqttSession = {
  brokerUrl: string;
};

export async function getMqttSession(
  monitorId: string,
  accessToken: string
): Promise<MqttSession> {
  const data = await geckoGet(
    `/v1/monitors/${monitorId}/iot/thirdPartySession`,
    accessToken
  );
  return { brokerUrl: data.brokerUrl };
}
