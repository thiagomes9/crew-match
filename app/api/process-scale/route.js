export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Buffer, File } from "buffer";

// ==========================
// Telegram helper (inline)
// ==========================
async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    }
  );
}

// ==========================
// Clients
// ==========================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ==========================
// API
// ==========================
export async function POST(req) {
  try {
    const { path, email } = await req.json();

    if (!path || !email) {
      return NextResponse.json(
        { error: "path e email são obrigatórios" },
        { status: 400 }
      );
    }

    // 1️⃣ Baixar PDF do Supabase Storage
    const { data, error } = await supabase.storage
      .from("schedules")
      .download(path);

    if (error || !data) {
      return NextResponse.json(
        { error: "Erro ao baixar arquivo" },
        { status: 500 }
      );
    }

    // 2️⃣ Converter para File (Node)
    const arrayBuffer = await data.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const file = new File([fileBuffer], "schedule.pdf", {
      type: "application/pdf",
    });

    // 3️⃣ Enviar PDF para OpenAI
    const openaiFile = await openai.files.create({
      file,
      purpose: "assistants",
    });

    // 4️⃣ Prompt
    const prompt = `
Você é um assistente especialista em leitura de escalas de pilotos.

Extraia APENAS os pernoites.

Retorne SOMENTE um JSON válido no formato:
[
  { "city": "GRU", "date": "2026-02-18" }
]

Regras:
- Data YYYY-MM-DD
- Cidade código IATA (3 letras)
- Ignore folgas, reservas e voos sem pernoite
- Nenhum texto fora do JSON
`;

    // 5️⃣ Chamada à OpenAI
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_file", file_id: openaiFile.id },
          ],
        },
      ],
    });

    const text = response.output_text;

    let stays = [];
    try {
      stays = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "IA retornou JSON inválido" },
        { status: 500 }
      );
    }

    // 6️⃣ Salvar pernoites + detectar match
    for (const stay of stays) {
      if (!stay.city || !stay.date) continue;

      const city = stay.city.toLowerCase();

      await supabase.from("stays").insert({
        user_email: email,
        city,
        date: stay.date,
      });

      const { data: all } = await supabase
        .from("stays")
        .select("user_email")
        .eq("city", city)
        .eq("date", stay.date);

      if (all && all.length > 1) {
        const others = all
          .map(s => s.user_email)
          .filter(u => u !== email);

        if (others.length > 0) {
          const message = `
✈️ Match de pernoite!

📍 ${city.toUpperCase()}
📅 ${stay.date}

👥 Você + ${others.join(", ")}
`;
          await sendTelegramMessage(message);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      stays,
    });

  } catch (err) {
    return NextResponse.json(
      { error: "Erro interno ao processar escala" },
      { status: 500 }
    );
  }
}
