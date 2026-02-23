import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase (service role – server side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  console.log("🔥 process-scale EXECUTADO", new Date().toISOString());

  try {
    /* =========================
       1️⃣ LER BODY
    ========================= */
    const { raw_text, user_email } = await req.json();

    console.log("📥 body recebido:", {
      hasText: !!raw_text,
      user_email,
      textLength: raw_text?.length,
    });

    if (!raw_text || !user_email) {
      return NextResponse.json(
        { error: "Texto ou usuário ausente" },
        { status: 400 }
      );
    }

    /* =========================
       2️⃣ BUSCAR USUÁRIO
    ========================= */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", user_email)
      .single();

    if (profileError || !profile) {
      console.error("❌ profileError:", profileError);
      return NextResponse.json(
        { error: "Usuário não encontrado em profiles" },
        { status: 400 }
      );
    }

    const userId = profile.id;
    console.log("👤 userId:", userId);

    /* =========================
       3️⃣ CRIAR SCHEDULE
    ========================= */
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text,
        processed: false,
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("❌ scheduleError:", scheduleError);
      return NextResponse.json(
        { error: "Erro ao criar schedule" },
        { status: 500 }
      );
    }

    console.log("📄 schedule criado:", schedule.id);

    /* =========================
       4️⃣ MOCK DE PERNOITES
       (substitui OpenAI temporariamente)
    ========================= */
    const stays = [
      {
        city: "GRU",
        check_in: "2026-03-01T22:00",
        check_out: "2026-03-02T08:00",
      },
      {
        city: "SDU",
        check_in: "2026-03-05T23:30",
        check_out: "2026-03-06T07:00",
      },
    ];

    /* =========================
       5️⃣ INSERIR STAYS
    ========================= */
    const formattedStays = stays.map((s) => ({
      user_id: userId,
      city: s.city,
      check_in: s.check_in,
      check_out: s.check_out,
      schedule_id: schedule.id,
    }));

    const { error: staysError } = await supabase
      .from("stays")
      .insert(formattedStays);

    if (staysError) {
      console.error("❌ staysError:", staysError);
      return NextResponse.json(
        { error: "Erro ao inserir stays" },
        { status: 500 }
      );
    }

    console.log("📍 stays inseridos:", formattedStays.length);

    /* =========================
       6️⃣ FINALIZAR SCHEDULE
    ========================= */
    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("id", schedule.id);

    console.log("✅ process-scale FINALIZADO COM SUCESSO");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🔥 process-scale ERROR:", error);
    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}