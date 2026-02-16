import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
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
    console.log("API process-scale chamada");

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

    const { data: file, error: downloadError } = await supabase
      .storage
      .from("schedules")
      .download(filePath);

    if (downloadError || !file) {
      console.error("Erro download PDF:", downloadError);
      return NextResponse.json(
        { error: "Erro ao baixar PDF" },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    console.log("PDF baixado do Storage");

    /* =========================
       2️⃣ Extrair TEXTO do PDF
       (SOLUÇÃO DEFINITIVA p/ Vercel)
    ========================= */

    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(fileBuffer);

    const pdfText = parsed?.text || "";

    if (pdfText.length < 50) {
      return NextResponse.json(
        { error: "Texto do PDF inválido ou vazio" },
        { status: 400 }
      );
    }

    /* =========================
       3️⃣ Enviar TEXTO à OpenAI
       (não o PDF → evita erro 413)
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
Você receberá o texto de uma escala de voo.

Extraia APENAS os pernoites no formato JSON abaixo:

[
  { "city": "GRU", "date": "YYYY-MM-DD" }
]

Regras:
- Cidade em IATA (3 letras)
- Data em formato ISO
- Não explique nada
- Não escreva nada fora do JSON

Texto da escala:
${pdfText}
`,
            },
          ],
        },
      ],
    });

    const rawText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("Resposta IA:", rawText);

    let stays;
    try {
      stays = JSON.parse(rawText);
    } catch (err) {
      console.error("JSON inválido IA:", rawText);
      return NextResponse.json(
        { error: "IA retornou JSON inválido" },
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

    const inserts = stays.map((s) => ({
      city: s.city.toUpperCase(),
      date: s.date,
      user_email,
    }));

    const { error: insertError } = await supabase
      .from("stays")
      .insert(inserts);

    if (insertError) {
      console.error("Erro insert stays:", insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoites" },
        { status: 500 }
      );
    }

    console.log("Pernoites salvos com sucesso");

    /* =========================
       5️⃣ Notificar matches
    ========================= */

    await notifyMatches(stays);

    return NextResponse.json({
      ok: true,
      pernoites: stays.length,
    });

  } catch (err) {
    console.error("Erro geral process-scale:", err);
    return NextResponse.json(
      { error: "Erro interno process-scale" },
      { status: 500 }
    );
  }
}
