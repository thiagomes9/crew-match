import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ⚠️ Service Role é necessário aqui (API server-side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    /* =========================
       1️⃣ LER FORMDATA
    ========================= */
    const formData = await req.formData();
    const file = formData.get("file");

    // ⚠️ por enquanto o frontend envia email
    const userEmail = formData.get("user_id");

    if (!file || !userEmail) {
      return NextResponse.json(
        { error: "Arquivo ou usuário ausente" },
        { status: 400 }
      );
    }

    /* =========================
       2️⃣ RESOLVER USER_ID (UUID)
    ========================= */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", userEmail)
      .single();

    if (profileError || !profile) {
      console.error("profile error:", profileError);
      return NextResponse.json(
        { error: "Usuário não encontrado no profiles" },
        { status: 400 }
      );
    }

    const userId = profile.id;

    /* =========================
       3️⃣ LER PDF (pdf-parse)
    ========================= */
    // require é necessário por causa do Turbopack
    let rawText = "";

try {
  const { default: pdfParse } = await import("pdf-parse");

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfData = await pdfParse(buffer);

  rawText = pdfData.text || "";
} catch (e) {
  console.error("PDF PARSE ERROR:", e);
  return NextResponse.json(
    { error: "Erro ao ler o PDF da escala" },
    { status: 400 }
  );
}

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: "Não foi possível extrair texto do PDF" },
        { status: 400 }
      );
    }

    /* =========================
       4️⃣ CRIAR SCHEDULE
    ========================= */
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text: rawText,
        processed: false,
      })
      .select()
      .single();

    if (scheduleError) {
      console.error("schedule error:", scheduleError);
      throw scheduleError;
    }

    /* =========================
       5️⃣ OPENAI – EXTRAIR PERNOITES
    ========================= */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Você é um parser de escala aérea.
Extraia APENAS os pernoites.
Retorne SOMENTE JSON válido no formato:

[
  {
    "city": "string",
    "check_in": "YYYY-MM-DDTHH:mm",
    "check_out": "YYYY-MM-DDTHH:mm"
  }
]
          `,
        },
        {
          role: "user",
          content: rawText,
        },
      ],
    });

    let stays;

    try {
      stays = JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      console.error(
        "OpenAI raw response:",
        completion.choices[0].message.content
      );
      throw new Error("Resposta da OpenAI não é JSON válido");
    }

    if (!Array.isArray(stays) || stays.length === 0) {
      return NextResponse.json(
        { error: "Nenhum pernoite encontrado na escala" },
        { status: 400 }
      );
    }

    /* =========================
       6️⃣ INSERIR STAYS
    ========================= */
    const formattedStays = stays.map((stay) => ({
      user_id: userId,
      city: stay.city,
      check_in: stay.check_in,
      check_out: stay.check_out,
      schedule_id: schedule.id,
    }));

    const { error: staysError } = await supabase
      .from("stays")
      .insert(formattedStays);

    if (staysError) {
      console.error("stays error:", staysError);
      throw staysError;
    }

    /* =========================
       7️⃣ MARCAR SCHEDULE COMO PROCESSADO
    ========================= */
    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("id", schedule.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("process-scale error:", error);
    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}