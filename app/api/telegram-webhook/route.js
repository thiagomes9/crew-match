export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  const body = await req.json();

  if (!body.message) {
    return NextResponse.json({ ok: true });
  }

  const chatId = body.message.chat.id;
  const text = body.message.text || "";

  // Esperado: /start email@exemplo.com
  if (text.startsWith("/start")) {
    const email = text.split(" ")[1];

    if (!email) {
      return NextResponse.json({ ok: true });
    }

    // Salva ou atualiza o usuário
    await supabase
      .from("users")
      .upsert({
        email,
        telegram_chat_id: chatId,
      });

    // Confirma no Telegram
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ Telegram conectado com sucesso ao Crew Match!",
        }),
      }
    );
  }

  return NextResponse.json({ ok: true });
}
