import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import { notifyMatches } from "@/lib/notifyMatches";

export const runtime = "nodejs";

/* =========================
   CLIENTES
========================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* =========================
   POST /api/process-scale
========================= */

export async function POST(req) {
  try {
    console.log("📥 API process-scale chamada");

    const { filePath, user_email } = await req.json();

    if (!filePath || !user_email) {
      return NextResponse.json(
        { error: "filePath e user_email são obrigatórios" },
        { status: 400 }
      );
    }

    /* =========================
       1️⃣ Baixar PDF do Supabase
    ========================= */

    const { data: file, error } = await supabase
      .storage
      .from("schedules")
      .download(filePath);

    if (error) {
      console.error("❌ Erro ao baixar PDF:", error);
      return NextResponse.json(
        { error: "Erro ao baixar PDF" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("📄 PDF baixado do Storage");

    /* =========================
       2️⃣ Extrair TEXTO do PDF
    ========================= */

    const parsed = await pdfParse(buffer);
    const text = parsed.text;

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Texto insuficiente no PDF" },
        { status: 400 }
      );
    }

    console.log("🧠 Texto extraído do PDF");

    /* =========================
       3️⃣ Enviar TEXTO para IA
    ========================= */

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Você receberá o TEXTO de uma escala de voo.

Extraia APENAS os PERNOITES no formato JSON:

[
  { "city": "GRU", "date": "YYYY-MM-DD" }
]

Regras:
- Cidade em IATA (3 letras)
- Data ISO
- Não explique nada
- Retorne SOMENTE JSON

TEXTO DA ESCALA:
"""
${text}
"""
              `,
            },
          ],
        },
      ],
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("🤖 Resposta da IA:", raw);

    let stays;
    try {
      stays = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "IA retornou JSON inválido", raw },
        { status: 500 }
      );
    }

    if (!Array.isArray(stays) || stays.length === 0) {
      return NextResponse.json(
        { error: "Nenhum pernoite encontrado" },
        { status: 400 }
      );
    }

    /* =========================
       4️⃣ Salvar pernoites
    ========================= */

    const inserts = stays.map(s => ({
      city: s.city.toUpperCase(),
      date: s.date,
      user_email,
    }));

    const { error: insertError } = await supabase
      .from("stays")
      .insert(inserts);

    if (insertError) {
      console.error("❌ Erro ao salvar stays:", insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoites" },
        { status: 500 }
      );
    }

    console.log("💾 Pernoites salvos");

    /* =========================
       5️⃣ Notificar matches
    ========================= */

    await notifyMatches({
      stays,
      triggeringEmail: user_email,
    });

    console.log("📲 Notificações processadas");

    return NextResponse.json({
      ok: true,
      total: stays.length,
    });

  } catch (err) {
    console.error("🔥 Erro geral process-scale:", err);
    return NextResponse.json(
      { error: "Erro interno process-scale" },
      { status: 500 }
    );
  }
}
