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

// lista fixa de aeroportos válidos (Brasil)
const VALID_AIRPORTS = [
  "GRU","CGH","VCP","GIG","BSB","CNF","SSA","REC","AJU",
  "FOR","BEL","POA","CWB","FLN","NAT","MCZ","SLZ",
  "JPA","THE","PMW","RAO","UDI","IOS","VIX","CPV"
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

    console.log("🔥 process-scale (EVENTOS + FILTRO)");

    /* =========================
       OPENAI — EXTRAI EVENTOS
    ========================= */
    const prompt = `
Você é um extrator técnico de eventos de escala aérea.

Extraia APENAS eventos de:
- INÍCIO de jornada
- FIM de jornada

Para cada evento, retorne:
- type: "start" ou "end"
- datetime: YYYY-MM-DDTHH:MM
- city: sigla do aeroporto (3 letras)

NÃO calcule descanso.
NÃO explique nada.
Retorne APENAS JSON válido.

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
          e.type &&
          !isNaN(e.date) &&
          e.city &&
          VALID_AIRPORTS.includes(e.city)
      )
      .sort((a, b) => a.date - b.date);

    console.log("📍 Eventos válidos:", ordered);

    /* =========================
       CALCULA PERNOITES (≥12h)
    ========================= */
    const stays = [];

    for (let i = 0; i < ordered.length - 1; i++) {
      const current = ordered[i];
      const next = ordered[i + 1];

      if (current.type === "end" && next.type === "start") {
        const hours = diffHours(current.date, next.date);

        if (hours >= 12) {
          stays.push({
            city: current.city,
            check_in: current.datetime,
            check_out: next.datetime,
            user_email,
          });
        }
      }
    }

    console.log(`🛏️ ${stays.length} pernoites válidos`);

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