export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    console.log("📨 Telegram payload:", JSON.stringify(body));

    if (!body.message || !body.message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = body.message.chat.id;
    const text = body.message.text;

    console.log("✉️ Texto recebido:", text);

    if (!text.startsWith("/start")) {
      return NextResponse.json({ ok: true });
    }

    const email = text.replace("/start", "").trim();

    if (!email.includes("@")) {
      await sendMessage(chatId, "❌ Use:\n/start seu@email.com");
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from("users")
      .upsert(
        { email, telegram_chat_id: chatId },
        { onConflict: "email" }
      );

    if (error) {
      console.error("❌ Erro Supabase:", error);
      await sendMessage(chatId, "❌ Erro ao salvar usuário.");
      return NextResponse.json({ ok: true });
    }

    await sendMessage(
      chatId,
      `✅ Telegram conectado com sucesso!\n📧 ${email}`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("❌ Erro webhook:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  const data = await res.json();
  console.log("📤 Resposta Telegram:", data);
}

