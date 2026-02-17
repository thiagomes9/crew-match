"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   SUPABASE CLIENT (FRONT)
========================= */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* =========================
   PAGE
========================= */

export default function Home() {
  const [file, setFile] = useState(null);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [stays, setStays] = useState([]);

  // 🔒 usuário fixo por enquanto (como está no seu projeto)
  const userEmail = "joao@joao.com.br";

  /* =========================
     LOAD STAYS
  ========================= */

  async function loadStays() {
    const { data } = await supabase
      .from("stays")
      .select("*")
      .order("date", { ascending: true });

    setStays(data || []);
  }

  useEffect(() => {
    loadStays();
  }, []);

  /* =========================
     ENVIAR ESCALA PARA IA
  ========================= */

  async function enviarEscalaParaIA() {
    try {
      if (!file) {
        alert("Selecione um PDF primeiro");
        return;
      }

      const fileName = `${Date.now()}.pdf`;
      const filePath = `${userEmail}/${fileName}`;

      // 1️⃣ Upload no Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("schedules")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        console.error(uploadError);
        alert("Erro ao enviar PDF");
        return;
      }

      // 2️⃣ Chamada da IA
      const res = await fetch("/api/process-scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          user_email: userEmail,
        }),
      });

      const text = await res.text();
      console.log("process-scale:", res.status, text);

      if (!res.ok) {
        alert("Erro ao processar escala com IA");
        return;
      }

      alert("Escala processada com sucesso!");
      setFile(null);
      loadStays();

    } catch (err) {
      console.error(err);
      alert("Erro inesperado");
    }
  }

  /* =========================
     SALVAR PERNOITE MANUAL
  ========================= */

  async function salvarPernoiteManual() {
    if (!city || !date) {
      alert("Preencha cidade e data");
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
    console.log("save-stay:", data);

    if (!res.ok) {
      alert("Erro ao salvar pernoite");
      return;
    }

    setCity("");
    setDate("");
    loadStays();
  }

  /* =========================
     UI
  ========================= */

  return (
    <main style={{ padding: 20, maxWidth: 600 }}>
      <h1>✈️ Crew Match</h1>
      <p>Logado como: <b>{userEmail}</b></p>

      <hr />

      <h2>📄 Enviar escala</h2>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={enviarEscalaParaIA}>
        Enviar escala para IA
      </button>

      <hr />

      <h2>🏨 Novo pernoite</h2>

      <input
        placeholder="Cidade (ex: GRU)"
        value={city}
        onChange={(e) => setCity(e.target.value.toUpperCase())}
      />

      <br /><br />

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <br /><br />

      <button onClick={salvarPernoiteManual}>
        Salvar pernoite
      </button>

      <hr />

      <h2>📌 Pernoites cadastrados</h2>

      <ul>
        {stays.map((s) => (
          <li key={s.id}>
            📍 {s.city} — {s.date} — {s.user_email}
          </li>
        ))}
      </ul>
    </main>
  );
}
