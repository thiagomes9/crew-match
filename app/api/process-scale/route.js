import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const userId = formData.get("user_id");

    if (!file || !userId) {
      return NextResponse.json(
        { error: "Arquivo ou usuário ausente" },
        { status: 400 }
      );
    }

    // 🔹 pdf-parse usando require (compatível com Turbopack)
    const pdfParse = require("pdf-parse");

    // 1️⃣ Ler PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    // 2️⃣ Criar schedule (escala bruta)
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text: rawText,
        processed: false,
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("schedule error:", scheduleError);
      throw scheduleError;
    }

    // 3️⃣ OpenAI – extrair pernoites
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Você é um parser de escala aérea.
Extraia APENAS os pernoites.
Retorne SOMENTE JSON válido no formato:

[
  {
    "city": "string",
    "check_in": "YYYY-MM-DDTHH:mm",
    "check_out": "YYYY-MM-DDTHH:mm"
  }
]
          `,
        },
        {
          role: "user",
          content: rawText,
        },
      ],
    });

    const stays = JSON.parse(completion.choices[0].message.content);

    if (!Array.isArray(stays)) {
      throw new Error("Resposta da OpenAI não é um array");
    }

    // 4️⃣ Inserir pernoites
    const formattedStays = stays.map((stay) => ({
      user_id: userId,
      city: stay.city,
      check_in: stay.check_in,
      check_out: stay.check_out,
      schedule_id: schedule.id,
    }));

    const { error: staysError } = await supabase
      .from("stays")
      .insert(formattedStays);

    if (staysError) {
      console.error("stays error:", staysError);
      throw staysError;
    }

    // 5️⃣ Marcar schedule como processado
    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("id", schedule.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("process-scale error:", error);
    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}