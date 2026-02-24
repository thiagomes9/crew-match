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
  let tmpPath;

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

    console.log("📄 OCR iniciado");

    const buffer = Buffer.from(await file.arrayBuffer());

    const safeName = `input-${Date.now()}.pdf`;
    const outputPrefix = `ocr-output/${Date.now()}/`;

    tmpPath = path.join(os.tmpdir(), safeName);
    fs.writeFileSync(tmpPath, buffer);

    // upload PDF
    await storage.bucket(bucketName).upload(tmpPath, {
      destination: safeName,
      contentType: "application/pdf",
    });

    const gcsInputUri = `gs://${bucketName}/${safeName}`;
    const gcsOutputUri = `gs://${bucketName}/${outputPrefix}`;

    console.log("☁️ PDF enviado para GCS");

    /* =========================
       OCR PDF (OBRIGATÓRIO)
    ========================= */
    const request = {
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: gcsInputUri },
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          outputConfig: {
            gcsDestination: { uri: gcsOutputUri },
          },
        },
      ],
    };

    console.log("🔍 Chamando Google Vision OCR");

    const [operation] =
      await visionClient.asyncBatchAnnotateFiles(request);

    await operation.promise();

    /* =========================
       LER RESULTADO DO OCR
    ========================= */
    const [files] = await storage
      .bucket(bucketName)
      .getFiles({ prefix: outputPrefix });

    let text = "";

    for (const file of files) {
      if (!file.name.endsWith(".json")) continue;

      const [content] = await file.download();
      const json = JSON.parse(content.toString());

      const pages = json.responses || [];
      for (const page of pages) {
        if (page.fullTextAnnotation?.text) {
          text += page.fullTextAnnotation.text + "\n";
        }
      }
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "OCR não conseguiu extrair texto" },
        { status: 400 }
      );
    }

    console.log("✅ OCR concluído com sucesso");

    return NextResponse.json({ text });
  } catch (err) {
    console.error("❌ OCR PDF ERROR:", err);
    return NextResponse.json(
      { error: "Erro ao processar OCR PDF" },
      { status: 500 }
    );
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}