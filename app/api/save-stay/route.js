import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyMatches } from "@/lib/notifyMatches";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { city, date, user_email } = await req.json();

    if (!city || !date || !user_email) {
      return NextResponse.json(
        { error: "Dados incompletos" },
        { status: 400 }
      );
    }

    // 1️⃣ Salva o pernoite
    const { error: insertError } = await supabase
      .from("stays")
      .insert({
        city: city.toLowerCase(),
        date,
        user_email,
      });

    if (insertError) {
      console.error("Erro ao salvar stay:", insertError);
      return NextResponse.json(
        { error: "Erro ao salvar pernoite" },
        { status: 500 }
      );
    }

    // 2️⃣ Dispara notificação individual (anti-spam fica no helper)
    await notifyMatches({
      city: city.toLowerCase(),
      date,
      triggeringEmail: user_email,
    });

    return NextResponse.json({
      ok: true,
      message: "Pernoite salvo e notificações processadas",
    });
  } catch (err) {
    console.error("Erro save-stay:", err);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
