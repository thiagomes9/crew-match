"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [stays, setStays] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);

  // MVP: usuário fixo (depois vem auth real)
  const userEmail = "joao@joao.com.br";

  /* =========================
     LOAD STAYS
  ========================= */
  async function loadStays() {
    const res = await fetch(`/api/stays?user_email=${userEmail}`);
    const data = await res.json();
    setStays(data);
  }

  /* =========================
     LOAD MATCHES
  ========================= */
  async function loadMatches() {
    const res = await fetch(`/api/matches?user_email=${userEmail}`);
    const data = await res.json();
    setMatches(data);
  }

  useEffect(() => {
    loadStays();
    loadMatches();
  }, []);

  /* =========================
     SAVE STAY (manual)
  ========================= */
  async function saveStay() {
    if (!city || !date) {
      alert("Cidade e data são obrigatórias");
      return;
    }

    const res = await fetch("/api/save-stay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city,
        date,
        user_email: userEmail,
      }),
    });

    if (!res.ok) {
      alert("Erro ao salvar pernoite");
      return;
    }

    setCity("");
    setDate("");

    await loadStays();
    await loadMatches();
  }

  /* =========================
     EXTRACT TEXT FROM PDF (BROWSER)
  ========================= */
  async function extractTextFromPdf(file) {
    const pdfjs = await import("pdfjs-dist/build/pdf");

    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    let text = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      text += content.items.map(item => item.str || "").join(" ") + "\n";
    }

    return text;
  }

  /* =========================
     PROCESS SCALE (PDF + OCR)
  ========================= */
  async function processScale() {
    if (!file) {
      alert("Selecione um arquivo PDF");
      return;
    }

    setLoading(true);

    try {
      // 1️⃣ tentar extrair texto normalmente
      let rawText = await extractTextFromPdf(file);

      // 2️⃣ fallback OCR se necessário
      if (!rawText || rawText.trim().length < 50) {
        console.log("📸 PDF sem texto — usando OCR");

        const formData = new FormData();
        formData.append("file", file);

        const ocrRes = await fetch("/api/ocr", {
          method: "POST",
          body: formData,
        });

        const ocrData = await ocrRes.json();

        if (!ocrRes.ok) {
          alert("Não foi possível ler a escala (nem OCR).");
          setLoading(false);
          return;
        }

        rawText = ocrData.text;
      }

      // 3️⃣ enviar texto para backend / IA
      const res = await fetch("/api/process-scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: rawText,
          user_email: userEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erro ao processar escala");
        setLoading(false);
        return;
      }

      await loadStays();
      await loadMatches();
    } catch (err) {
      console.error(err);
      alert("Erro ao processar o PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>✈️ Crew Match</h1>
      <p>
        Logado como: <b>{userEmail}</b>
      </p>

      <hr />

      <h2>📄 Enviar escala (PDF)</h2>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />
      <br /><br />
      <button onClick={processScale} disabled={loading}>
        {loading ? "Processando..." : "Enviar escala"}
      </button>

      <hr />

      <h2>➕ Novo pernoite (manual)</h2>
      <input
        placeholder="Cidade (ex: GRU)"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />
      <br /><br />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <br /><br />
      <button onClick={saveStay}>Salvar pernoite</button>

      <hr />

      <h2>📍 Pernoites cadastrados</h2>
      {stays.length === 0 && <p>Nenhum pernoite</p>}
      <ul>
        {stays.map((s, i) => (
          <li key={i}>
            📍 {s.city} — {s.date}
          </li>
        ))}
      </ul>

      <hr />

      <h2>🤝 Matches de pernoite</h2>
      {matches.length === 0 && <p>Nenhum match</p>}
      <ul>
        {matches.map((m, i) => (
          <li key={i}>
            🤝 {m.city} — {m.date}
            <br />
            👥 {m.users.join(", ")}
          </li>
        ))}
      </ul>
    </main>
  );
}