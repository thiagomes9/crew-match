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

export async function POST(req) {
  try {
    /* =========================
       1️⃣ FORM DATA
    ========================= */
    const formData = await req.formData();
    const file = formData.get("file");
    const userEmail = formData.get("user_id");

    if (!file || !userEmail) {
      return NextResponse.json(
        { error: "Arquivo ou usuário ausente" },
        { status: 400 }
      );
    }

    /* =========================
       2️⃣ USER → UUID
    ========================= */
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", userEmail)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Usuário não encontrado no profiles" },
        { status: 400 }
      );
    }

    const userId = profile.id;

    /* =========================
       3️⃣ PDFJS v5 (ÚNICA FORMA CORRETA)
    ========================= */
    let rawText = "";

    try {
      const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");

      const buffer = Buffer.from(await file.arrayBuffer());

      const pdf = await pdfjsLib.getDocument({
        data: buffer,
        disableFontFace: true,
      }).promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        rawText += content.items.map(i => i.str || "").join(" ") + "\n";
      }
    } catch (err) {
      console.error("PDFJS ERROR:", err);
      return NextResponse.json(
        { error: "Erro ao extrair texto do PDF" },
        { status: 400 }
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "PDF não contém texto legível" },
        { status: 400 }
      );
    }

    /* =========================
       4️⃣ SAVE SCHEDULE
    ========================= */
    const { data: schedule } = await supabase
      .from("schedules")
      .insert({
        user_id: userId,
        raw_text: rawText,
        processed: false,
      })
      .select()
      .single();

    /* =========================
       5️⃣ OPENAI
    ========================= */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Extraia apenas pernoites da escala.
Retorne SOMENTE JSON no formato:

[
  {
    "city": "string",
    "check_in": "YYYY-MM-DDTHH:mm",
    "check_out": "YYYY-MM-DDTHH:mm"
  }
]
          `,
        },
        { role: "user", content: rawText },
      ],
    });

    const stays = JSON.parse(completion.choices[0].message.content);

    const formatted = stays.map(s => ({
      user_id: userId,
      city: s.city,
      check_in: s.check_in,
      check_out: s.check_out,
      schedule_id: schedule.id,
    }));

    await supabase.from("stays").insert(formatted);

    await supabase
      .from("schedules")
      .update({ processed: true })
      .eq("id", schedule.id);

    return NextResponse.json({ success: true });

  } catch (e) {
    console.error("process-scale error:", e);
    return NextResponse.json(
      { error: "Erro ao processar escala" },
      { status: 500 }
    );
  }
}