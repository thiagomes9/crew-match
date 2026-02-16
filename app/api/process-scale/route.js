import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { notifyMatches } from "@/lib/notifyMatches";
import { Buffer } from "buffer";

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

    const { data: file, error } = await supabase
      .storage
      .from("schedules")
      .download(filePath);

    if (error || !file) {
      console.error("Erro ao baixar PDF:", error);
      return NextResponse.json(
        { error: "Erro ao baixar PDF" },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("PDF baixado do Storage");

    /* =========================
       2️⃣ Upload do PDF para OpenAI
    ========================= */

    const uploadedFile = await openai.files.create({
      file: buffer,
      filename: "escala.pdf",
      purpose: "assistants",
    });

    console.log("Arquivo enviado para OpenAI:", uploadedFile.id);

    /* =========================
       3️⃣ Extração estruturada
    ========================= */

    const aiResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Extraia APENAS os pernoites do PDF.

Formato EXATO (JSON puro):
[
  { "city": "GRU", "date": "YYYY-MM-DD" }
]

Regras:
- Cidade em IATA (3 letras)
- Data ISO
- Não escreva nada fora do JSON
              `.trim(),
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
      aiResponse.output_text ||
      aiResponse.output?.[0]?.content?.[0]?.text ||
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
       4️⃣ Deduplicar pernoites
    ========================= */

    const uniqueStays = Array.from(
      new Map(
        stays.map(s => [
          `${s.city}-${s.date}`,
          {
            city: s.city.toUpperCase(),
            date: s.date,
            user_email,
          }
        ])
      ).values()
    );

    /* =========================
       5️⃣ Salvar no banco
    ========================= */

    const { error: insertError } = await supabase
      .from("stays")
      .insert(uniqueStays);

    if (insertError) {
      console.error("Erro ao salvar pernoites:", insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoites" },
        { status: 500 }
      );
    }

    console.log("Pernoites salvos");

    /* =========================
       6️⃣ Notificação individual
    ========================= */

    for (const stay of uniqueStays) {
      await notifyMatches({
        city: stay.city,
        date: stay.date,
        triggeringEmail: user_email,
      });
    }

    return NextResponse.json({
      ok: true,
      pernoites: uniqueStays.length,
    });

  } catch (err) {
    console.error("Erro process-scale:", err);
    return NextResponse.json(
      { error: "Erro interno process-scale" },
      { status: 500 }
    );
  }
}
