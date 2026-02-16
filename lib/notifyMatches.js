import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "./telegram";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function notifyMatches(city, date) {
  // 1️⃣ Buscar todos os pernoites iguais
  const { data: stays } = await supabase
    .from("stays")
    .select("user_email")
    .eq("city", city)
    .eq("date", date);

  if (!stays || stays.length < 2) return;

  // 2️⃣ Notificar cada usuário apenas uma vez
  for (const stay of stays) {
    const email = stay.user_email;

    // 🔒 ANTI-SPAM: já notificamos?
    const { data: alreadySent } = await supabase
      .from("match_notifications")
      .select("id")
      .eq("user_email", email)
      .eq("city", city)
      .eq("date", date)
      .maybeSingle();

    if (alreadySent) {
      console.log(`🔕 Já notificado: ${email} ${city} ${date}`);
      continue;
    }

    // Buscar Telegram
    const { data: user } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .eq("email", email)
      .single();

    if (!user?.telegram_chat_id) continue;

    const others = stays
      .map(s => s.user_email)
      .filter(e => e !== email);

    if (others.length === 0) continue;

    const message = `
✈️ *Novo match de pernoite!*

📍 Cidade: ${city.toUpperCase()}
📅 Data: ${date}

👥 Outros pilotos:
${others.map(o => `• ${o}`).join("\n")}
`;

    // 3️⃣ Enviar Telegram
    await sendTelegramMessage(user.telegram_chat_id, message);

    // 4️⃣ Registrar notificação (trava definitiva)
    await supabase.from("match_notifications").insert({
      user_email: email,
      city,
      date,
    });

    console.log(`✅ Notificação enviada para ${email}`);
  }
}
