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
       1️⃣ Baixar PDF
    ========================= */

    const { data: file, error } = await supabase
      .storage
      .from("schedules")
      .download(filePath);

    if (error || !file) {
      console.error("Erro download:", error);
      return NextResponse.json(
        { error: "Erro ao baixar PDF" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("PDF baixado do Storage");

    /* =========================
       2️⃣ Upload para OpenAI
    ========================= */

    const uploaded = await openai.files.create({
      file: new File([buffer], "escala.pdf", {
        type: "application/pdf",
      }),
      purpose: "assistants",
    });

    console.log("PDF enviado para OpenAI:", uploaded.id);

    /* =========================
       3️⃣ Extração com IA
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
Extraia APENAS os pernoites deste PDF.

Formato EXATO:
[
  { "city": "GRU", "date": "YYYY-MM-DD" }
]

Regras:
- Apenas JSON
- Sem explicações
- Cidade em IATA
              `,
            },
            {
              type: "input_file",
              file_id: uploaded.id,
            },
          ],
        },
      ],
    });

    let rawText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("Resposta bruta da IA:", rawText);

    /* =========================
       4️⃣ LIMPEZA CRÍTICA (FIX)
    ========================= */

    rawText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let stays;
    try {
      stays = JSON.parse(rawText);
    } catch (e) {
      console.error("JSON inválido:", rawText);
      return NextResponse.json(
        { error: "IA retornou JSON inválido", rawText },
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
       5️⃣ Salvar pernoites
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
      console.error(insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoites" },
        { status: 500 }
      );
    }

    console.log("Pernoites salvos:", inserts.length);

    /* =========================
       6️⃣ Notificações
    ========================= */

    await notifyMatches(stays);

    return NextResponse.json({
      ok: true,
      pernoites: stays.length,
    });

  } catch (err) {
    console.error("Erro process-scale:", err);
    return NextResponse.json(
      { error: "Erro interno process-scale" },
      { status: 500 }
    );
  }
}
