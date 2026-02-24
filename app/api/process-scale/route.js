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

// extrai siglas de aeroporto
function extractCities(text) {
  return text.match(/\b[A-Z]{3}\b/g) || [];
}

// parse seguro
function safeJsonParse(text) {
  try {
    return JSON.parse(
      text.replace(/```json|```/g, "").trim()
    );
  } catch {
    return null;
  }
}

// diferença em horas
function diffHours(a, b) {
  return (b - a) / 1000 / 60 / 60;
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

    console.log("🔥 process-scale (EVENTOS) iniciado");

    /* =========================
       OPENAI — EXTRAI EVENTOS
    ========================= */
    const prompt = `
Você é um extrator técnico de eventos de escala aérea.

A partir do texto abaixo (escala OCR), identifique APENAS
eventos de INÍCIO e FIM de jornada.

Para cada evento, retorne:
- type: "start" ou "end"
- datetime: no formato YYYY-MM-DDTHH:MM
- city: cidade associada ao evento

NÃO calcule descanso.
NÃO explique nada.

Retorne APENAS JSON válido:

[
  {
    "type": "end",
    "datetime": "YYYY-MM-DDTHH:MM",
    "city": "SIGLA"
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

    console.log("🧠 IA eventos:", events);

    if (!Array.isArray(events) || events.length < 2) {
      return NextResponse.json({
        message: "Eventos insuficientes para cálculo",
      });
    }

    /* =========================
       ORDENA EVENTOS
    ========================= */
    const ordered = events
      .filter((e) => e.type && e.datetime)
      .sort(
        (a, b) =>
          new Date(a.datetime) - new Date(b.datetime)
      );

    /* =========================
       CALCULA PERNOITES
    ========================= */
    const stays = [];

    for (let i = 0; i < ordered.length - 1; i++) {
      const current = ordered[i];
      const next = ordered[i + 1];

      if (current.type === "end" && next.type === "start") {
        const start = new Date(current.datetime);
        const end = new Date(next.datetime);

        const hours = diffHours(start, end);

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

    console.log(
      `🛏️ ${stays.length} pernoites operacionais calculados`
    );

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
        { error: "Erro ao inserir stays" },
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