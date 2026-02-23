import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // necessário para inserir com RLS
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

    /* 1️⃣ Ler PDF */
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdf(buffer);
    const rawText = pdfData.text;

    /* 2️⃣ Criar schedule */
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text: rawText,
        processed: false,
      })
      .select()
      .single();

    if (scheduleError) throw scheduleError;

    /* 3️⃣ Chamar OpenAI (somente para pernoites) */
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

    /* 4️⃣ Inserir pernoites */
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

    if (staysError) throw staysError;

    /* 5️⃣ Marcar schedule como processado */
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