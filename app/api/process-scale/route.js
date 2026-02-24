import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* =========================
   CLIENTS
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
/* =========================
   HELPERS
========================= */
function isValidStay({ city, check_in, check_out }) {
  if (!city || !check_in || !check_out) return false;

  const inDate = new Date(check_in);
  const outDate = new Date(check_out);

  if (isNaN(inDate) || isNaN(outDate)) return false;

  const diffHours = (outDate - inDate) / 1000 / 60 / 60;

  // mínimo 6 horas
  if (diffHours < 6) return false;

  // precisa cruzar dia
  if (inDate.toDateString() === outDate.toDateString()) {
    return false;
  }

  return true;
}

function safeJsonParse(text) {
  try {
    // remove ```json ``` se existir
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (e) {
    console.error("❌ JSON inválido da IA:", text);
    return null;
  }
}

/* =========================
   ROUTE
========================= */
export async function POST(req) {
  try {
    const { raw_text, user_email } = await req.json();

    if (!raw_text || !user_email) {
      return NextResponse.json(
        { error: "raw_text ou user_email ausente" },
        { status: 400 }
      );
    }

    console.log("🔥 process-scale EXECUTADO", new Date().toISOString());

    /* =========================
       OPENAI PROMPT
    ========================= */
    const prompt = `
Você é um extrator técnico de dados.

A partir do texto abaixo (escala de tripulante aéreo), identifique APENAS
intervalos contínuos de tempo em que o tripulante NÃO está voando ou em serviço.

REGRAS IMPORTANTES:
- NÃO decida se é pernoite ou não
- NÃO filtre por base
- NÃO deduza hotel
- NÃO explique nada

Retorne APENAS um JSON válido, no formato:

[
  {
    "city": "SIGLA_AEROPORTO",
    "check_in": "YYYY-MM-DDTHH:MM",
    "check_out": "YYYY-MM-DDTHH:MM"
  }
]

Texto da escala:
"""
${raw_text}
"""
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const aiText = completion.choices[0]?.message?.content || "";
    const parsed = safeJsonParse(aiText);

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Resposta inválida da IA" },
        { status: 500 }
      );
    }

    /* =========================
       FILTRO BACKEND
    ========================= */
    const validStays = parsed.filter(isValidStay);

    console.log(
      `🧠 IA retornou ${parsed.length} blocos — ${validStays.length} válidos`
    );

    if (validStays.length === 0) {
      return NextResponse.json({ message: "Nenhum pernoite válido" });
    }

    /* =========================
       INSERT STAYS
    ========================= */
    const inserts = validStays.map((s) => ({
      city: s.city,
      check_in: s.check_in,
      check_out: s.check_out,
      user_email,
    }));

    const { error } = await supabase.from("stays").insert(inserts);

    if (error) {
      console.error("❌ staysError:", error);
      return NextResponse.json(
        { error: "Erro ao inserir stays" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      inserted: inserts.length,
    });
  } catch (err) {
    console.error("❌ process-scale error:", err);
    return NextResponse.json(
      { error: "Erro interno no process-scale" },
      { status: 500 }
    );
  }
}