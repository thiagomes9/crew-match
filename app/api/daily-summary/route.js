export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";

// ==========================
// Supabase client (SERVICE ROLE)
// ==========================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================
// Telegram helper
// ==========================
async function sendTelegram(chatId, text) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    }
  );
}

// ==========================
// POST – chamado pelo CRON
// ==========================
export async function POST() {
  console.log("📊 Daily summary acionado");

  try {
    // 1️⃣ Buscar usuários com Telegram conectado
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("email, telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      console.log("ℹ️ Nenhum usuário com Telegram");
      return Response.json({ ok: true });
    }

    // 2️⃣ Buscar pernoites futuros
    const today = new Date().toISOString().split("T")[0];

    const { data: stays, error: staysError } = await supabase
      .from("stays")
      .select("city, date, user_email")
      .gte("date", today)
      .order("date", { ascending: true });

    if (staysError) throw staysError;

    // 3️⃣ Agrupar por cidade + data
    const grouped = {};
    for (const stay of stays) {
      const key = `${stay.city}-${stay.date}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(stay.user_email);
    }

    // 4️⃣ Enviar resumo para cada usuário
    for (const user of users) {
      let message = "✈️ <b>Resumo diário de pernoites</b>\n\n";
      let hasMatches = false;

      for (const key in grouped) {
        const [city, date] = key.split("-");
        const emails = grouped[key];

        if (emails.includes(user.email) && emails.length > 1) {
          hasMatches = true;
          message += `📍 <b>${city}</b> — ${date}\n`;
          emails.forEach(e => {
            message += `• ${e}\n`;
          });
          message += "\n";
        }
      }

      if (!hasMatches) {
        message += "😴 Nenhum match de pernoite por enquanto.";
      }

      await sendTelegram(user.telegram_chat_id, message);
    }

    console.log("✅ Daily summary enviado com sucesso");
    return Response.json({ ok: true });

  } catch (err) {
    console.error("❌ Erro daily summary:", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
