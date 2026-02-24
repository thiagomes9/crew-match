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
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
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

    // salvar PDF temporariamente
    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPdfPath = path.join(os.tmpdir(), `${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdfPath, buffer);

    /* =========================
       OCR PDF (asyncBatch)
    ========================= */
    const request = {
      requests: [
        {
          inputConfig: {
            mimeType: "application/pdf",
            content: buffer.toString("base64"),
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    };

    const [operation] = await client.asyncBatchAnnotateFiles(request);
    const [response] = await operation.promise();

    const pages =
      response.responses?.[0]?.responses || [];

    let text = "";

    for (const page of pages) {
      if (page.fullTextAnnotation?.text) {
        text += page.fullTextAnnotation.text + "\n";
      }
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "OCR não conseguiu extrair texto" },
        { status: 400 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("OCR PDF ERROR:", err);
    return NextResponse.json(
      { error: "Erro ao processar OCR PDF" },
      { status: 500 }
    );
  }
}