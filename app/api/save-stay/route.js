import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyMatches } from "@/lib/notifyMatches";

// 🔐 Cliente com SERVICE ROLE (backend only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { city, date, user_email } = body;

    // 1️⃣ Validação básica
    if (!city || !date || !user_email) {
      return NextResponse.json(
        { error: "city, date e user_email são obrigatórios" },
        { status: 400 }
      );
    }

    const normalizedCity = city.toLowerCase().trim();

    // 2️⃣ Inserir pernoite
    const { error: insertError } = await supabase
      .from("stays")
      .insert({
        city: normalizedCity,
        date,
        user_email,
      });

    if (insertError) {
      // Evita erro se o mesmo usuário tentar inserir o mesmo pernoite
      if (insertError.code === "23505") {
        console.log("⚠️ Pernoite duplicado ignorado");
      } else {
        console.error("❌ Erro ao inserir pernoite:", insertError);
        return NextResponse.json(
          { error: "Erro ao salvar pernoite" },
          { status: 500 }
        );
      }
    }

    // 3️⃣ 🔔 Notificação em tempo real (com anti-spam)
    await notifyMatches(normalizedCity, date);

    return NextResponse.json({
      ok: true,
      message: "Pernoite salvo e matches verificados",
    });
  } catch (err) {
    console.error("❌ Erro geral save-stay:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
