import { NextRequest, NextResponse } from "next/server";
import {
  getRecentRecommendations,
  insertRecommendation,
} from "@/lib/db/queries";

/**
 * GET /api/assistant — fetch saved recommendation history.
 */
export async function GET() {
  const recent = await getRecentRecommendations(20);
  return NextResponse.json({
    recommendations: recent.map((r) => ({
      id: r.id,
      summary: r.summary,
      text: JSON.parse(r.recommendations).text,
      model: r.model,
      timestamp: r.timestamp,
    })),
  });
}

/**
 * POST /api/assistant — save a recommendation from an external Claude conversation.
 * Body: { text: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const text = body.text as string | undefined;

  if (!text || !text.trim()) {
    return NextResponse.json(
      { error: "Kein Text angegeben." },
      { status: 400 },
    );
  }

  const stored = await insertRecommendation({
    summary: text.slice(0, 200),
    recommendations: JSON.stringify({ text }),
    context: "{}",
    model: "manuell",
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    id: stored.id,
    text,
    model: "manuell",
    timestamp: stored.timestamp,
  });
}
