export async function sendTelegramMessage(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    console.warn("Telegram não configurado corretamente", {
      tokenExists: !!token,
      chatId,
    });
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });
}
