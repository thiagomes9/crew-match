"use client";

import { useEffect, useState } from "react";

/* =========================
   PAGE
========================= */

export default function Home() {
  const [file, setFile] = useState(null);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [stays, setStays] = useState([]);
  const [matches, setMatches] = useState([]);
  const [userEmail, setUserEmail] = useState("");

  /* =========================
     LOAD USER
  ========================= */

  useEffect(() => {
    const savedEmail = localStorage.getItem("user_email");
    if (savedEmail) {
      setUserEmail(savedEmail);
    }
  }, []);

  /* =========================
     LOAD STAYS
  ========================= */

  useEffect(() => {
    if (!userEmail) return;

    fetch(`/api/notify?user_email=${userEmail}`)
      .then((r) => r.json())
      .then((data) => {
        setStays(data.stays || []);
        setMatches(data.matches || []);
      });
  }, [userEmail]);

  /* =========================
     LOGIN
  ========================= */

  if (!userEmail) {
    return (
      <main style={{ padding: 20 }}>
        <h2>Crew Match</h2>
        <input
          placeholder="Digite seu email"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              localStorage.setItem("user_email", e.target.value);
              setUserEmail(e.target.value);
            }
          }}
        />
        <p>Pressione Enter</p>
      </main>
    );
  }

  /* =========================
     HANDLERS
  ========================= */

  async function uploadScale() {
    if (!file) {
      alert("Selecione um arquivo");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch("/api/upload-scale", {
      method: "POST",
      body: formData,
    });

    const uploadData = await uploadRes.json();

    if (!uploadData.filePath) {
      alert("Erro ao subir arquivo");
      return;
    }

    const res = await fetch("/api/process-scale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filePath: uploadData.filePath,
        user_email: userEmail,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert("Erro ao processar escala com IA");
      return;
    }

    alert("Escala processada com sucesso");
  }

  async function saveStay() {
    if (!city || !date) {
      alert("Cidade e data são obrigatórios");
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

    const data = await res.json();

    if (!res.ok) {
      alert("Erro ao salvar pernoite");
      return;
    }

    setCity("");
    setDate("");
    alert("Pernoite salvo");
  }

  /* =========================
     UI
  ========================= */

  return (
    <main style={{ padding: 20 }}>
      <h1>✈️ Crew Match</h1>

      <p>Logado como: <b>{userEmail}</b></p>
      <button
        onClick={() => {
          localStorage.removeItem("user_email");
          setUserEmail("");
        }}
      >
        Trocar usuário
      </button>

      <hr />

      <h3>📤 Enviar escala</h3>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <br />
      <button onClick={uploadScale}>Enviar escala para IA</button>

      <hr />

      <h3>🛏️ Novo pernoite</h3>
      <input
        placeholder="Cidade (IATA)"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />
      <br />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <br />
      <button onClick={saveStay}>Salvar pernoite</button>

      <hr />

      <h3>🤝 Matches de pernoite</h3>
      {matches.map((m, i) => (
        <div key={i}>
          📍 {m.city} — {m.date}
          <br />
          {m.emails.map((e) => (
            <div key={e}>• {e}</div>
          ))}
        </div>
      ))}

      <hr />

      <h3>📅 Pernoites cadastrados</h3>
      {stays.map((s, i) => (
        <div key={i}>
          📍 {s.city} — {s.date} — {s.user_email}
        </div>
      ))}
    </main>
  );
}
