import { NextResponse } from "next/server";
import vision from "@google-cloud/vision";
import fs from "fs";
import os from "os";
import path from "path";

const client = new vision.ImageAnnotatorClient({
  credentials: JSON.parse(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  ),
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo não enviado" },
        { status: 400 }
      );
    }

    // salvar temporariamente no /tmp
    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, buffer);

    // OCR
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