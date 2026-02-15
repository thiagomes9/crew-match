import { NextResponse } from "next/server";

// ⚠️ MUITO IMPORTANTE NO VERCEL
export const runtime = "nodejs";

export async function POST(request) {
  try {
    console.log("📅 Daily summary acionado");

    return NextResponse.json({
      ok: true,
      message: "Daily summary executado com sucesso",
    });
  } catch (error) {
    console.error("Erro daily-summary:", error);
    return NextResponse.json(
      { error: "Erro no daily summary" },
      { status: 500 }
    );
  }
}

// (opcional, só para abrir no browser)
export async function GET() {
  return NextResponse.json({
    message: "Use POST para executar o resumo diário",
  });
}
