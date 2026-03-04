import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    console.log("🔥 process-scale EXECUTADO");

    const body = await req.json();
    const { text, user_email } = body;

    if (!text) {
      return NextResponse.json({ error: "Texto da escala ausente" }, { status: 400 });
    }

    if (!user_email) {
      return NextResponse.json({ error: "Usuário não informado" }, { status: 400 });
    }

    /*
    ==========================================
    BUSCAR BASE DO USUÁRIO
    ==========================================
    */

    const { data: profile } = await supabase
      .from("profiles")
      .select("base")
      .eq("email", user_email)
      .single();

    const userBase = profile?.base;

    console.log("🏠 Base do usuário:", userBase);

    /*
    ==========================================
    EXTRAIR EVENTOS DA ESCALA COM IA
    ==========================================
    */

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Você é um especialista em escalas de tripulação aérea.

Extraia TODOS os eventos operacionais da escala.

Cada evento deve conter:

- date (ISO)
- city (código ICAO ou IATA)
- label (tipo do evento: voo, apresentação, corte, etc)

Responda APENAS em JSON no formato:

[
  {
    "date": "2026-03-01T05:00",
    "city": "REC",
    "label": "apresentacao"
  }
]
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    let events;

    try {
      events = JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error("❌ JSON inválido da OpenAI:", completion.choices[0].message.content);
      return NextResponse.json({ error: "JSON inválido da IA" }, { status: 500 });
    }

    if (!events || !Array.isArray(events)) {
      return NextResponse.json({ error: "IA não retornou eventos válidos" }, { status: 500 });
    }

    /*
    ==========================================
    ORDENAR EVENTOS
    ==========================================
    */

    const ordered = events
      .map(e => ({
        ...e,
        date: new Date(e.date)
      }))
      .sort((a, b) => a.date - b.date);

    console.log("🧠 EVENTOS ORDENADOS:");

    for (const ev of ordered) {
      console.log(
        ev.date.toISOString(),
        ev.city,
        ev.label || "-"
      );
    }

    /*
    ==========================================
    DETECTAR PERNOITES OPERACIONAIS
    ==========================================
    */

    const overnights = [];

    for (let i = 0; i < ordered.length - 1; i++) {

      const current = ordered[i];
      const next = ordered[i + 1];

      const diffHours =
        (next.date.getTime() - current.date.getTime()) / 3600000;

      if (
        diffHours >= 12 &&
        current.city &&
        next.city &&
        current.city === next.city &&
        current.city !== userBase
      ) {
        overnights.push({
          city: current.city,
          check_in: current.date,
          check_out: next.date
        });
      }
    }

    console.log("🛏️ Pernoites identificados:", overnights.length);

    /*
    ==========================================
    SALVAR NO BANCO
    ==========================================
    */

    for (const stay of overnights) {

      const { data: existing } = await supabase
        .from("stays")
        .select("id")
        .eq("city", stay.city)
        .eq("user_email", user_email)
        .eq("check_in", stay.check_in.toISOString());

      if (existing && existing.length > 0) {
        continue;
      }

      await supabase.from("stays").insert({
        city: stay.city,
        user_email,
        check_in: stay.check_in,
        check_out: stay.check_out
      });
    }

    return NextResponse.json({
      success: true,
      overnights: overnights.length
    });

  } catch (err) {

    console.error("process-scale error:", err);

    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}