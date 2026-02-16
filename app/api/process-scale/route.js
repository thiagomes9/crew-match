import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { notifyMatches } from "@/lib/notifyMatches";
import pdf from "pdf-parse";

export const runtime = "nodejs";

/* =========================
   CLIENTS
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
    console.log("📥 process-scale chamado");

    const { filePath, user_email } = await req.json();

    if (!filePath || !user_email) {
      return NextResponse.json(
        { error: "filePath e user_email obrigatórios" },
        { status: 400 }
      );
    }

    /* =========================
       1️⃣ Download PDF
    ========================= */

    const { data, error } = await supabase
      .storage
      .from("schedules")
      .download(filePath);

    if (error || !data) {
      console.error("❌ Erro ao baixar PDF:", error);
      return NextResponse.json(
        { error: "Erro ao baixar PDF" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    console.log("✅ PDF baixado");

    /* =========================
       2️⃣ Extrair TEXTO (com limite)
    ========================= */

    const parsed = await pdf(buffer);

    const pdfText = (parsed.text || "")
      .replace(/\s+/g, " ")
      .slice(0, 12000); // 🔥 LIMITE ANTI-413

    if (!pdfText) {
      return NextResponse.json(
        { error: "PDF sem texto legível" },
        { status: 400 }
      );
    }

    /* =========================
       3️⃣ OpenAI
    ========================= */

    const aiResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
Extraia APENAS os pernoites da escala abaixo.

Formato JSON estrito:

[
  { "city": "GRU", "date": "YYYY-MM-DD" }
]

Regras:
- IATA (3 letras)
- Data ISO
- Sem texto fora do JSON

ESCALA:
${pdfText}
      `,
    });

    const text =
      aiResponse.output_text ||
      aiResponse.output?.[0]?.content?.find(c => c.type === "output_text")?.text;

    console.log("🤖 Resposta IA:", text);

    if (!text) {
      return NextResponse.json(
        { error: "IA não retornou texto" },
        { status: 500 }
      );
    }

    let stays;
    try {
      stays = JSON.parse(text);
    } catch (e) {
      console.error("❌ JSON inválido:", text);
      return NextResponse.json(
        { error: "IA retornou JSON inválido", raw: text },
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
       4️⃣ Salvar no banco
    ========================= */

    const rows = stays.map(s => ({
      city: s.city.toLowerCase(),
      date: s.date,
      user_email,
    }));

    const { error: insertError } = await supabase
      .from("stays")
      .insert(rows);

    if (insertError) {
      console.error("❌ Erro DB:", insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoites" },
        { status: 500 }
      );
    }

    console.log("💾 Pernoites salvos");

    /* =========================
       5️⃣ Notificar (1 a 1)
    ========================= */

    for (const stay of stays) {
      await notifyMatches({
        city: stay.city.toLowerCase(),
        date: stay.date,
        triggeringEmail: user_email,
      });
    }

    return NextResponse.json({
      ok: true,
      pernoites: stays.length,
    });

  } catch (err) {
    console.error("🔥 Erro process-scale:", err);
    return NextResponse.json(
      { error: "Erro ao processar escala com IA" },
      { status: 500 }
    );
  }
}
