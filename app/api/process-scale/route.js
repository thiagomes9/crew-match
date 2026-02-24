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

// extrai todas as siglas de aeroporto do texto
function extractCitiesFromText(text) {
  const matches = text.match(/\b[A-Z]{3}\b/g);
  return matches || [];
}

// encontra a última cidade mencionada antes do índice
function findCityBeforeIndex(text, index) {
  const beforeText = text.slice(0, index);
  const cities = extractCitiesFromText(beforeText);
  return cities.length > 0 ? cities[cities.length - 1] : null;
}

function isValidStay({ check_in, check_out }) {
  const inDate = new Date(check_in);
  const outDate = new Date(check_out);

  if (isNaN(inDate) || isNaN(outDate)) return false;

  const diffHours = (outDate - inDate) / 1000 / 60 / 60;

  // abordagem abrangente
  return diffHours >= 8;
}

function mergeConsecutiveStays(stays) {
  if (!stays.length) return [];

  const sorted = [...stays].sort(
    (a, b) => new Date(a.check_in) - new Date(b.check_in)
  );

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    const gapHours =
      Math.abs(
        new Date(next.check_in) - new Date(current.check_out)
      ) /
      1000 /
      60 /
      60;

    if (gapHours <= 3) {
      current.check_out = next.check_out;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

function safeJsonParse(text) {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
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

    console.log("🔥 process-scale iniciado");

    /* =========================
       OPENAI — APENAS INTERVALOS
    ========================= */
    const prompt = `
A partir do texto abaixo (escala de tripulante aéreo),
extraia APENAS intervalos contínuos de tempo em que
o tripulante NÃO está voando ou em serviço.

NÃO inclua cidade.
NÃO explique nada.

Retorne APENAS JSON válido:

[
  {
    "check_in": "YYYY-MM-DDTHH:MM",
    "check_out": "YYYY-MM-DDTHH:MM"
  }
]

Texto:
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
       BACKEND DECIDE CIDADE
    ========================= */
    const staysWithCity = parsed
      .filter(isValidStay)
      .map((stay) => {
        const idx = raw_text.indexOf(stay.check_in.split("T")[0]);
        const city = findCityBeforeIndex(raw_text, idx);

        return {
          city,
          check_in: stay.check_in,
          check_out: stay.check_out,
        };
      })
      .filter((s) => s.city);

    const finalStays = mergeConsecutiveStays(staysWithCity);

    console.log(
      `🛏️ ${finalStays.length} pernoites identificados`
    );

    if (!finalStays.length) {
      return NextResponse.json({
        message: "Nenhum pernoite identificado",
      });
    }

    /* =========================
       INSERT STAYS
    ========================= */
    const inserts = finalStays.map((s) => ({
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
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}