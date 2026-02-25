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
   CONFIG
========================= */
const VALID_AIRPORTS = [
  "GRU","CGH","VCP","GIG","BSB","CNF","SSA","REC","AJU",
  "FOR","BEL","POA","CWB","FLN","NAT","MCZ","SLZ",
  "JPA","THE","PMW","RAO","UDI","IOS","VIX",
  "IPN","MOC" // adicionados
];

/* =========================
   HELPERS
========================= */
function safeJsonParse(text) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

function diffHours(a, b) {
  return (b - a) / 1000 / 60 / 60;
}

function normalizeCity(city) {
  if (!city) return null;
  return city.trim().toUpperCase();
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

    /* =========================
       BUSCA BASE DO USUÁRIO
    ========================= */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("base")
      .eq("email", user_email)
      .single();

    if (profileError || !profile?.base) {
      return NextResponse.json(
        { error: "Base do usuário não definida" },
        { status: 400 }
      );
    }

    const BASE_AIRPORT = profile.base.trim().toUpperCase();
    console.log("🏠 Base do usuário:", BASE_AIRPORT);

    /* =========================
       OPENAI — EXTRAI EVENTOS
    ========================= */
    const prompt = `
Você é um analista técnico de escalas aéreas brasileiras.

A partir do texto abaixo, extraia TODOS os eventos operacionais
que possuam DATA, HORA e CIDADE.

Considere como eventos:
- apresentação
- início de jornada
- fim de jornada
- término de etapa
- chegada
- saída
- qualquer evento com data + hora + aeroporto

Para cada evento, retorne:
- datetime: YYYY-MM-DDTHH:MM
- city: código IATA (3 letras)
- label: descrição curta do evento

NÃO calcule descanso.
NÃO interprete pernoite.
NÃO filtre nada.

Retorne APENAS JSON válido:

[
  {
    "datetime": "YYYY-MM-DDTHH:MM",
    "city": "XXX",
    "label": "texto"
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
    const events = safeJsonParse(aiText);

    console.log("🧠 Eventos brutos da IA:", events);

    if (!Array.isArray(events) || events.length < 2) {
      return NextResponse.json({
        message: "Eventos insuficientes",
      });
    }

    /* =========================
       NORMALIZA + ORDENA
    ========================= */
    const ordered = events
      .map((e) => ({
        ...e,
        city: normalizeCity(e.city),
        date: new Date(e.datetime),
      }))
      .filter(
        (e) =>
          !isNaN(e.date) &&
          e.city &&
          VALID_AIRPORTS.includes(e.city)
      )
      .sort((a, b) => a.date - b.date);

    console.log("📍 Eventos válidos:", ordered);

    /* =========================
       CALCULA PERNOITES (≥12h)
       REGRA: cidade = 1º evento do dia seguinte
    ========================= */
    const stays = [];

    for (let i = 0; i < ordered.length - 1; i++) {
      const current = ordered[i];
      const next = ordered[i + 1];

      const hours = diffHours(current.date, next.date);

      if (
        hours >= 12 &&
        next.city !== BASE_AIRPORT
      ) {
        stays.push({
          city: next.city, // cidade do pernoite = onde começa o dia seguinte
          check_in: current.date.toISOString(),
          check_out: next.date.toISOString(),
          user_email,
        });
      }
    }

    console.log(`🛏️ ${stays.length} pernoites calculados`);

    if (!stays.length) {
      return NextResponse.json({
        message: "Nenhum pernoite operacional identificado",
      });
    }

    /* =========================
       INSERT STAYS
    ========================= */
    const { error } = await supabase.from("stays").insert(stays);

    if (error) {
      console.error("❌ staysError:", error);
      return NextResponse.json(
        { error: "Erro ao inserir pernoites" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      inserted: stays.length,
    });

  } catch (err) {
    console.error("❌ process-scale error:", err);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}