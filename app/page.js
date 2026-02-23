"use client";

import { useEffect, useState } from "react";
import { getDocument } from "pdfjs-dist";

// obrigatório para pdfjs no browser
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function Home() {
  const [file, setFile] = useState(null);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [stays, setStays] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);

  // MVP: usuário fixo
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
     EXTRACT PDF TEXT (BROWSER)
  ========================= */
async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;

  let text = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    text += content.items.map(item => item.str || "").join(" ") + "\n";
  }

  return text;
}
  /* =========================
     PROCESS SCALE (IA)
  ========================= */
  async function processScale() {
    if (!file) {
      alert("Selecione um arquivo PDF");
      return;
    }

    setLoading(true);

    try {
      // 1️⃣ extrair texto no frontend
      const rawText = await extractTextFromPdf(file);

      if (!rawText.trim()) {
        alert("Não foi possível extrair texto do PDF");
        setLoading(false);
        return;
      }

      // 2️⃣ enviar texto para o backend
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
    } catch (e) {
      console.error(e);
      alert("Erro ao ler o PDF");
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
        {loading ? "Processando..." : "Enviar escala para IA"}
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
            📍 {s.city} — {s.check_in || s.date}
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