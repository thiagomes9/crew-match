import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "./telegram";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Evita spam: não notifica o próprio usuário
export async function notifyMatches({ city, date, user_email }) {
  // Buscar outros pernoites iguais
  const { data: stays } = await supabase
    .from("stays")
    .select("user_email")
    .eq("city", city)
    .eq("date", date)
    .neq("user_email", user_email);

  if (!stays || stays.length === 0) return;

  for (const stay of stays) {
    const { data: user } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .eq("email", stay.user_email)
      .single();

    if (!user?.telegram_chat_id) continue;

    await sendTelegramMessage(
      user.telegram_chat_id,
      `✈️ Novo match de pernoite!\n📍 ${city}\n📅 ${date}\n👤 ${user_email}`
    );
  }
}
