import { NextResponse } from "next/server";
import vision from "@google-cloud/vision";
import fs from "fs";
import os from "os";
import path from "path";

/* =========================
   VALIDAR ENV
========================= */
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  console.error("❌ GOOGLE_APPLICATION_CREDENTIALS_JSON não definida");
}

const client = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  ? new vision.ImageAnnotatorClient({
      credentials: JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
      ),
    })
  : null;

export async function POST(req) {
  try {
    if (!client) {
      return NextResponse.json(
        { error: "OCR não configurado no servidor" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo não enviado" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buffer);

    const [result] = await client.textDetection(tmpPath);
    const text = result.fullTextAnnotation?.text || "";

    if (!text.trim()) {
      return NextResponse.json(
        { error: "OCR não conseguiu extrair texto" },
        { status: 400 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("OCR ERROR:", err);
    return NextResponse.json(
      { error: "Erro ao processar OCR" },
      { status: 500 }
    );
  }
}