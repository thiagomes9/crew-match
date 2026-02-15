export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ==========================
// Supabase
// ==========================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ==========================
// Telegram helper
// ==========================
async function sendTelegram(chatId, message) {
  if (!chatId) return;

  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
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
// API
// ==========================
export async function GET() {
  try {
    // Data de amanhã (YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().split("T")[0];

    // Buscar pernoites de amanhã
    const { data: stays } = await supabase
      .from("stays")
      .select("city, user_email")
      .eq("date", date);

    if (!stays || stays.length === 0) {
      return NextResponse.json({ ok: true, message: "Sem pernoites amanhã" });
    }

    // Agrupar por cidade
    const cities = {};
    stays.forEach(s => {
      if (!cities[s.city]) cities[s.city] = [];
      cities[s.city].push(s.user_email);
    });

    // Buscar usuários com Telegram
    const { data: users } = await supabase
      .from("users")
      .select("email, telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    // Enviar resumo individual
    for (const user of users) {
      let text = `📋 Resumo de pernoites – Amanhã (${date})\n\n`;

      Object.entries(cities).forEach(([city, emails]) => {
        if (emails.includes(user.email)) {
          text += `📍 ${city.toUpperCase()} – ${emails.length} piloto(s)\n`;
        }
      });

      if (text.includes("📍")) {
        text += `\n✈️ Crew Match`;
        await sendTelegram(user.telegram_chat_id, text);
      }
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    return NextResponse.json(
      { error: "Erro no resumo diário" },
      { status: 500 }
    );
  }
}
