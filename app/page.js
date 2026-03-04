"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

export default function Home() {

  const [file, setFile] = useState(null);

  const userEmail = "joao@joao.com.br";

  async function extractPdfText(file) {

    try {

      const arrayBuffer = await file.arrayBuffer();

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {

        const page = await pdf.getPage(i);

        const content = await page.getTextContent();

        const strings = content.items.map(item => item.str);

        fullText += strings.join(" ") + "\n";

      }

      return fullText;

    } catch (err) {

      console.log("❌ erro ao ler pdf:", err);

      return null;

    }
  }

  async function runOCR(file) {

    const formData = new FormData();

    formData.append("file", file);

    const res = await fetch("/api/ocr", {

      method: "POST",

      body: formData

    });

    const data = await res.json();

    return data.text;

  }

  async function processScale() {

    if (!file) {

      alert("Selecione um PDF");

      return;

    }

    console.log("🚀 processScale chamado");

    let extractedText = await extractPdfText(file);

    if (!extractedText || extractedText.length < 50) {

      console.log("📄 PDF sem texto — usando OCR");

      extractedText = await runOCR(file);

    }

    if (!extractedText) {

      alert("Não foi possível ler a escala");

      return;

    }

    console.log("📨 enviando texto para process-scale");

    const res = await fetch("/api/process-scale", {

      method: "POST",

      headers: {

        "Content-Type": "application/json"

      },

      body: JSON.stringify({

        text: extractedText,

        user_email: userEmail

      })

    });

    if (!res.ok) {

      console.log("❌ erro API", res.status);

      alert("Erro ao processar escala");

      return;

    }

    const data = await res.json();

    console.log("✅ resposta:", data);

    alert("Escala processada!");

  }

  return (

    <main style={{ padding: 30 }}>

      <h1>Crew Match</h1>

      <p>Logado como: {userEmail}</p>

      <input

        type="file"

        accept="application/pdf"

        onChange={(e) => setFile(e.target.files[0])}

      />

      <br />

      <br />

      <button onClick={processScale}>

        Enviar escala

      </button>

    </main>

  );

}