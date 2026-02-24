import { NextResponse } from "next/server";
import vision from "@google-cloud/vision";
import { Storage } from "@google-cloud/storage";
import fs from "fs";
import os from "os";
import path from "path";

/* =========================
   GOOGLE CLIENTS
========================= */
const credentials = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

const visionClient = new vision.ImageAnnotatorClient({ credentials });
const storage = new Storage({ credentials });

const bucketName = process.env.GOOGLE_OCR_BUCKET;

/* =========================
   OCR PDF ROUTE
========================= */
export async function POST(req) {
  try {
    if (!bucketName) {
      return NextResponse.json(
        { error: "Bucket OCR não configurado" },
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

    const fileName = `ocr/${Date.now()}-${file.name}`;
    const tmpPath = path.join(os.tmpdir(), fileName);

    // 🔧 CORREÇÃO CRÍTICA: criar pasta /tmp/ocr
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

    fs.writeFileSync(tmpPath, buffer);

    // upload para GCS
    await storage.bucket(bucketName).upload(tmpPath, {
      destination: fileName,
      contentType: "application/pdf",
    });

    const gcsUri = `gs://${bucketName}/${fileName}`;

    const request = {
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: gcsUri },
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    };

    const [operation] =
      await visionClient.asyncBatchAnnotateFiles(request);

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