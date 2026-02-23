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
  console.log("🔥 process-scale EXECUTADO", new Date().toISOString());

  try {
    /* =========================
       1️⃣ LER BODY
    ========================= */
    const { raw_text, user_email } = await req.json();

    if (!raw_text || !user_email) {
      return NextResponse.json(
        { error: "Texto ou usuário ausente" },
        { status: 400 }
      );
    }

    /* =========================
       2️⃣ BUSCAR USUÁRIO
    ========================= */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", user_email)
      .single();

    if (profileError || !profile) {
      console.error("❌ profileError:", profileError);
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 400 }
      );
    }

    const userId = profile.id;

    /* =========================
       3️⃣ CRIAR SCHEDULE
    ========================= */
    const { error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text,
        processed: false,
      });

    if (scheduleError) {
      console.error("❌ scheduleError:", scheduleError);
      return NextResponse.json(
        { error: "Erro ao criar schedule" },
        { status: 500 }
      );
    }

    /* =========================
       4️⃣ OPENAI – EXTRAIR PERNOITES
    ========================= */
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
    "city": "GRU",
    "check_in": "YYYY-MM-DDTHH:mm",
    "check_out": "YYYY-MM-DDTHH:mm"
  }
]
          `,
        },
        {
          role: "user",
          content: raw_text,
        },
      ],
    });

    let stays;

try {
  let raw = completion.choices[0].message.content;

  // remover markdown ```json ```
  raw = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  stays = JSON.parse(raw);
} catch (e) {
  console.error("❌ JSON inválido da OpenAI:", completion.choices[0].message.content);
  return NextResponse.json(
    { error: "Resposta inválida da IA" },
    { status: 500 }
  );
}

    if (!Array.isArray(stays) || stays.length === 0) {
      return NextResponse.json(
        { error: "Nenhum pernoite encontrado" },
        { status: 400 }
      );
    }

    /* =========================
       5️⃣ INSERIR STAYS
    ========================= */
    const formattedStays = stays.map((s) => ({
      user_id: userId,
      user_email,
      city: s.city,
      check_in: s.check_in,
      check_out: s.check_out,
    }));

    const { error: staysError } = await supabase
      .from("stays")
      .insert(formattedStays);

    if (staysError) {
      console.error("❌ staysError:", staysError);
      return NextResponse.json(
        { error: "Erro ao inserir pernoites" },
        { status: 500 }
      );
    }

    /* =========================
       6️⃣ FINALIZAR
    ========================= */
    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("user_id", userId)
      .eq("processed", false);

    console.log("✅ process-scale FINALIZADO COM SUCESSO");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🔥 process-scale ERROR:", error);
    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}