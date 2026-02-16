import { sendTelegramMessage } from "./telegram";

export async function notifyMatches({
  supabase,
  city,
  date,
  triggeringEmail,
}) {
  try {
    console.log("🔔 notifyMatches iniciado:", { city, date, triggeringEmail });

    // 1️⃣ Buscar todos os pernoites iguais (mesma cidade e data)
    const { data: stays, error: staysError } = await supabase
      .from("stays")
      .select("user_email")
      .eq("city", city)
      .eq("date", date);

    if (staysError) {
      console.error("Erro ao buscar stays:", staysError);
      return;
    }

    // Emails únicos (removendo quem disparou)
    const emails = [
      ...new Set(
        stays
          .map((s) => s.user_email)
          .filter((email) => email !== triggeringEmail)
      ),
    ];

    if (emails.length === 0) {
      console.log("Nenhum outro usuário para notificar");
      return;
    }

    // 2️⃣ Buscar usuários com Telegram configurado
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("email, telegram_chat_id")
      .in("email", emails)
      .not("telegram_chat_id", "is", null);

    if (usersError) {
      console.error("Erro ao buscar usuários:", usersError);
      return;
    }

    if (!users || users.length === 0) {
      console.log("Usuários sem Telegram configurado");
      return;
    }

    // 3️⃣ Enviar mensagem individual
    for (const user of users) {
      const message =
        `✈️ *Novo match de pernoite!*\n\n` +
        `📍 Cidade: *${city.toUpperCase()}*\n` +
        `📅 Data: *${date}*\n\n` +
        `👥 Outro piloto também estará lá.\n` +
        `Acesse o Crew Match para detalhes.`;

      await sendTelegramMessage(user.telegram_chat_id, message);
    }

    console.log(`✅ ${users.length} notificações enviadas com sucesso`);
  } catch (err) {
    console.error("Erro geral notifyMatches:", err);
  }
}
