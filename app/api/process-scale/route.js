import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CLIENTES
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* =========================
   POST /api/process-scale
========================= */
export async function POST(req) {
  console.log("🔥 process-scale EXECUTADO", new Date().toISOString());

  try {
    /* =========================
       1️⃣ BODY
    ========================= */
    const { raw_text, user_email } = await req.json();

    if (!raw_text || !user_email) {
      return NextResponse.json(
        { error: "Texto ou usuário ausente" },
        { status: 400 }
      );
    }

    /* =========================
       2️⃣ USUÁRIO
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
       3️⃣ SCHEDULE
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
       4️⃣ OPENAI
    ========================= */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Você é um parser de escala aérea.
Extraia APENAS pernoites reais.

Considere pernoite somente quando:
- houver permanência mínima de 6 horas
- a permanência atravesse a madrugada

Retorne SOMENTE JSON válido no formato:

[
  {
    "city": "GRU",
    "check_in": "YYYY-MM-DDTHH:mm",
    "check_out": "YYYY-MM-DDTHH:mm"
  }
]

NÃO use markdown.
NÃO use \`\`\`json.
          `,
        },
        {
          role: "user",
          content: raw_text,
        },
      ],
    });

    /* =========================
       5️⃣ PARSE JSON (ROBUSTO)
    ========================= */
    let stays;

    try {
      let raw = completion.choices[0].message.content;

      raw = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      stays = JSON.parse(raw);
    } catch (e) {
      console.error(
        "❌ JSON inválido da OpenAI:",
        completion.choices[0].message.content
      );
      return NextResponse.json(
        { error: "Resposta inválida da IA" },
        { status: 500 }
      );
    }

    if (!Array.isArray(stays)) {
      return NextResponse.json(
        { error: "Formato inesperado da IA" },
        { status: 500 }
      );
    }

    /* =========================
       6️⃣ FILTRO DE PERNOITES
    ========================= */
    const filteredStays = stays.filter((s) => {
      if (!s.check_in || !s.check_out || !s.city) return false;

      const start = new Date(s.check_in);
      const end = new Date(s.check_out);

      if (isNaN(start) || isNaN(end)) return false;

      const hours = (end - start) / (1000 * 60 * 60);
      const startHour = start.getHours();

      return (
        hours >= 6 &&
        (startHour >= 18 || startHour <= 6)
      );
    });

    if (filteredStays.length === 0) {
      return NextResponse.json(
        { error: "Nenhum pernoite válido encontrado" },
        { status: 400 }
      );
    }

    /* =========================
       7️⃣ FORMATAR STAYS
    ========================= */
    const formattedStays = filteredStays.map((s) => {
      const date = s.check_in.split("T")[0]; // YYYY-MM-DD

      return {
        user_id: userId,
        user_email,
        city: s.city,
        date,
        check_in: s.check_in,
        check_out: s.check_out,
      };
    });

    /* =========================
       8️⃣ INSERIR STAYS
    ========================= */
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
       9️⃣ FINALIZAR
    ========================= */
    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("user_id", userId)
      .eq("processed", false);

    console.log("✅ process-scale FINALIZADO");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🔥 process-scale ERROR:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar escala" },
      { status: 500 }
    );
  }
}