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
       1️⃣ Baixar PDF do Storage
    ========================= */

    const { data: file, error: downloadError } = await supabase
      .storage
      .from("schedules")
      .download(filePath);

    if (downloadError || !file) {
      console.error("Erro download:", downloadError);
      return NextResponse.json(
        { error: "Erro ao baixar PDF" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("PDF baixado do Storage");

    /* =========================
       2️⃣ Enviar PDF para OpenAI
    ========================= */

    const uploadedFile = await openai.files.create({
      file: new File([buffer], "escala.pdf", {
        type: "application/pdf",
      }),
      purpose: "assistants",
    });

    console.log("Arquivo enviado para OpenAI:", uploadedFile.id);

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
Você receberá uma escala de voo em PDF.

Extraia APENAS os pernoites no seguinte formato JSON:

[
  { "city": "GRU", "date": "YYYY-MM-DD" }
]

Regras:
- Cidade sempre IATA (3 letras)
- Data em ISO (YYYY-MM-DD)
- Não explique nada
- Não escreva nada fora do JSON
              `,
            },
            {
              type: "input_file",
              file_id: uploadedFile.id,
            },
          ],
        },
      ],
    });

    const rawText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("Resposta da IA:", rawText);

    let stays;
    try {
      stays = JSON.parse(rawText);
    } catch {
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
      console.error("Erro insert:", insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoites" },
        { status: 500 }
      );
    }

    console.log("Pernoites salvos com sucesso");

    /* =========================
       5️⃣ Notificação individual
    ========================= */

    for (const stay of stays) {
      await notifyMatches({
        city: stay.city,
        date: stay.date,
        triggeringEmail: user_email,
      });
    }

    return NextResponse.json({
      ok: true,
      pernoites: stays.length,
    });

  } catch (err) {
    console.error("Erro geral process-scale:", err);
    return NextResponse.json(
      { error: "Erro ao processar escala com IA" },
      { status: 500 }
    );
  }
}
