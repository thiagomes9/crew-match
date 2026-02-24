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

const VALID_AIRPORTS = [
  "GRU","CGH","VCP","GIG","BSB","CNF","SSA","REC","AJU",
  "FOR","BEL","POA","CWB","FLN","NAT","MCZ","SLZ",
  "JPA","THE","PMW","RAO","UDI","IOS","VIX","LEC","RO2","CPV"
];

function safeJsonParse(text) {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function diffHours(a, b) {
  return (b - a) / 1000 / 60 / 60;
}

export async function POST(req) {
  try {
    const { raw_text, user_email } = await req.json();

    if (!raw_text || !user_email) {
      return NextResponse.json(
        { error: "raw_text ou user_email ausente" },
        { status: 400 }
      );
    }

    console.log("📄 Processando escala de:", user_email);

    /* =========================
       BUSCAR BASE DO USUÁRIO
    ========================= */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("base")
      .eq("email", user_email)
      .single();

    if (profileError || !profile?.base) {
      console.error("❌ Base não encontrada");
      return NextResponse.json(
        { error: "Base do usuário não definida" },
        { status: 400 }
      );
    }

    const BASE_AIRPORT = profile.base.trim().toUpperCase();
    console.log("🏠 Base do usuário:", BASE_AIRPORT);

    /* =========================
       OPENAI — EXTRAIR EVENTOS
    ========================= */
    const prompt = `
Você receberá uma escala de voo.

Extraia eventos de INÍCIO e FIM de jornada.

Retorne SOMENTE JSON válido:

[
  { "type": "start" ou "end", "datetime": "YYYY-MM-DDTHH:MM", "city": "XXX" }
]

Regras:
- Use sempre formato ISO.
- Cidade deve ser código IATA (3 letras).
- Não explique nada.

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

    if (!Array.isArray(events)) {
      console.error("❌ JSON inválido da OpenAI:", aiText);
      return NextResponse.json(
        { error: "Resposta inválida da IA" },
        { status: 500 }
      );
    }

    /* =========================
       NORMALIZAR E ORDENAR
    ========================= */
    const ordered = events
      .map((e) => ({
        ...e,
        city: e.city?.trim().toUpperCase(),
        date: new Date(e.datetime),
      }))
      .filter(
        (e) =>
          e.type &&
          !isNaN(e.date) &&
          VALID_AIRPORTS.includes(e.city)
      )
      .sort((a, b) => a.date - b.date);

    console.log("📊 Eventos identificados:", ordered.length);

    /* =========================
       GERAR PERNOITES
    ========================= */
    const stays = [];

    for (let i = 0; i < ordered.length - 1; i++) {
      const current = ordered[i];
      const next = ordered[i + 1];

      if (current.type === "end" && next.type === "start") {
        const hours = diffHours(current.date, next.date);

        if (
          hours >= 12 &&
          current.city !== BASE_AIRPORT
        ) {
          stays.push({
            city: current.city,
            check_in: current.date.toISOString(),
            check_out: next.date.toISOString(),
            user_email,
          });
        }
      }
    }

    console.log("🏨 Pernoites operacionais identificados:", stays.length);

    if (!stays.length) {
      return NextResponse.json({
        message: "Nenhum pernoite fora da base identificado",
      });
    }

    /* =========================
       INSERIR NO SUPABASE
    ========================= */
    const { error } = await supabase
      .from("stays")
      .insert(stays);

    if (error) {
      console.error("❌ Erro ao inserir stays:", error);
      return NextResponse.json(
        { error: "Erro ao inserir pernoites" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      inserted: stays.length,
    });

  } catch (err) {
    console.error("❌ ERRO GERAL:", err);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}