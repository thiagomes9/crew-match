import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { notifyMatches } from "@/lib/notifyMatches";
;

export const runtime = "nodejs";

// ==========================
// Clients
// ==========================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==========================
// POST
// ==========================
export async function POST(req) {
  try {
    console.log("📩 API process-scale chamada");

    const { filePath, user_email } = await req.json();

    if (!filePath || !user_email) {
      return NextResponse.json(
        { error: "filePath e user_email são obrigatórios" },
        { status: 400 }
      );
    }

    // ==========================
    // 1️⃣ Baixar PDF do Supabase Storage
    // ==========================
    const { data: fileData, error: downloadError } =
      await supabase.storage
        .from("schedules")
        .download(filePath);

    if (downloadError) {
      console.error("Erro ao baixar PDF:", downloadError);
      throw downloadError;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log("📄 Arquivo baixado do Storage");

    // ==========================
    // 2️⃣ Enviar PDF para OpenAI
    // ==========================
    const uploadedFile = await openai.files.create({
      file: buffer,
      purpose: "assistants",
    });

    console.log("📤 Arquivo enviado para OpenAI:", uploadedFile.id);

    // ==========================
    // 3️⃣ Chamar IA para extrair pernoites
    // ==========================
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Você é um sistema que extrai pernoites de escalas de pilotos.
Retorne APENAS um JSON no formato:

[
  { "city": "GRU", "date": "2026-02-18" }
]

Use código IATA de 3 letras.
Ignore voos sem pernoite.
`,
            },
            {
              type: "input_file",
              file_id: uploadedFile.id,
            },
          ],
        },
      ],
    });

    const text =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text;

    if (!text) {
      throw new Error("IA não retornou texto");
    }

    const stays = JSON.parse(text);

    console.log("🧠 Resposta da IA:", stays);

    // ==========================
    // 4️⃣ Salvar pernoites + notificar
    // ==========================
    for (const stay of stays) {
      const city = stay.city.toLowerCase();
      const date = stay.date;

      await supabase.from("stays").insert({
        city,
        date,
        user_email,
      });

      console.log(`💾 Pernoite salvo: ${city} ${date}`);

      // 🔔 Notificação em tempo real
      await notifyMatches(city, date);
    }

    console.log("✅ Pernoites salvos e notificações enviadas");

    return NextResponse.json({
      ok: true,
      message: "Escala processada com sucesso",
      stays,
    });
  } catch (err) {
    console.error("❌ Erro geral process-scale:", err);

    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}
