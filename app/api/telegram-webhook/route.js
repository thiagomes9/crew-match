import { NextResponse } from "next/server";

/**
 * FORÇA runtime Node (OBRIGATÓRIO no Vercel)
 */
export const runtime = "nodejs";

/**
 * POST
 */
export async function POST() {
  console.log("✅ daily-summary POST chamado");

  return NextResponse.json({
    ok: true,
    message: "Daily summary executado com sucesso",
  });
}

/**
 * GET (apenas para teste no browser)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST para executar o daily summary",
  });
}
