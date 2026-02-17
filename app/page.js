"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [stays, setStays] = useState([]);
  const [matches, setMatches] = useState([]);

  // 🔒 usuário fixo (como está hoje no projeto)
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
     PROCESS SCALE (IA)
  ========================= */
  async function processScale() {
    if (!file) {
      alert("Selecione um arquivo");
      return;
    }

    const filePath = `${userEmail}/${file.name}`;

    const res = await fetch("/api/process-scale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath,
        user_email: userEmail,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao processar escala com IA");
      return;
    }

    await loadStays();
    await loadMatches();
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>✈️ Crew Match</h1>
      <p>Logado como: <b>{userEmail}</b></p>

      <hr />

      <h2>Enviar escala</h2>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />
      <br /><br />
      <button onClick={processScale}>Enviar escala para IA</button>

      <hr />

      <h2>Novo pernoite</h2>
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
