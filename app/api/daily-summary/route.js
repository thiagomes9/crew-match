import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/app/lib/telegram";

// ==========================
// Clients
// ==========================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ==========================
// Utils
// ==========================
function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ==========================
// POST
// ==========================
export async function POST() {
  console.log("🚀 DAILY SUMMARY CHAMADO");

  const tomorrow = new Date().toISOString().split("T")[0];
  console.log("📅 Data usada:", tomorrow);

  const { data: stays, error } = await supabase
    .from("stays")
    .select("*")
    .eq("date", tomorrow);

  console.log("📦 Stays encontrados:", stays);

  if (!stays || stays.length === 0) {
    return NextResponse.json({ ok: true, reason: "SEM STAYS" });
  }

  return NextResponse.json({ ok: true, stays });
}

    // 2️⃣ Agrupar por cidade+data
    const groups = {};
    for (const stay of stays) {
      const key = `${stay.city}-${stay.date}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(stay.user_email);
    }

    // 3️⃣ Processar apenas onde há match (2+)
    for (const key of Object.keys(groups)) {
      const users = groups[key];
      if (users.length < 2) continue;

      const [city, date] = key.split("-");

      // 4️⃣ Para cada usuário do grupo
      for (const email of users) {
        const others = users.filter(u => u !== email);
        if (others.length === 0) continue;

        // Buscar chat_id
        const { data: user } = await supabase
          .from("users")
          .select("telegram_chat_id")
          .eq("email", email)
          .single();

        if (!user?.telegram_chat_id) {
          console.log(`⚠️ ${email} sem Telegram vinculado`);
          continue;
        }

        // Montar mensagem
        const message = `
✈️ *Crew Match – Amanhã*

📍 *${city}* — ${date}
👥 Você terá pernoite com:
${others.map(o => `• ${o}`).join("\n")}
        `;

        // Enviar Telegram
        await sendTelegramMessage(user.telegram_chat_id, message);
        console.log(`📲 Notificação enviada para ${email}`);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Resumo individual enviado com sucesso"
    });

  } catch (err) {
    console.error("❌ Erro daily-summary:", err);
    return NextResponse.json(
      { ok: false, error: "Erro no resumo diário" },
      { status: 500 }
    );
  }
}
