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
    const { raw_text, user_email } = await req.json();

    if (!raw_text || !user_email) {
      return NextResponse.json(
        { error: "Texto ou usuário ausente" },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", user_email)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 400 }
      );
    }

    const userId = profile.id;

    const { data: schedule } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text,
        processed: false,
      })
      .select()
      .single();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Extraia APENAS os pernoites da escala.
Retorne SOMENTE JSON no formato:

[
  {
    "city": "string",
    "check_in": "YYYY-MM-DDTHH:mm",
    "check_out": "YYYY-MM-DDTHH:mm"
  }
]
          `,
        },
        { role: "user", content: raw_text },
      ],
    });

    const stays = JSON.parse(completion.choices[0].message.content);

    const formatted = stays.map(s => ({
      user_id: userId,
      city: s.city,
      check_in: s.check_in,
      check_out: s.check_out,
      schedule_id: schedule.id,
    }));

    await supabase.from("stays").insert(formatted);

    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("id", schedule.id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}