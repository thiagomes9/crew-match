"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [logged, setLogged] = useState(false);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [stays, setStays] = useState([]);
  const [matches, setMatches] = useState([]);
  const [file, setFile] = useState(null);
  async function uploadScale() {
    async function uploadScale() {
  console.log("UPLOAD SCALE CLICKADO");}

  if (!file) {
    alert("Selecione um arquivo primeiro");
    return;
  }

  console.log("Arquivo:", file.name);

    
  if (!file) {
    alert("Selecione um arquivo primeiro");
    return;
  }

  const fileExt = file.name.split(".").pop();
  const filePath = `${email}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("schedules")
    .upload(filePath, file);

  if (error) {
    console.error(error);
    alert(error.message);
    return;
  }

  // Chamar a IA
  const res = await fetch("/api/process-scale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: filePath,
      email,
    }),
  });

  const json = await res.json();

  if (!json.ok) {
    alert("Erro ao processar escala com IA");
    console.error(json);
    return;
  }

  alert("Escala processada! Pernoites cadastrados automaticamente.");
  loadStays();
}


  

  

  function calculateMatches(stays) {
  const groups = {};

  stays.forEach((s) => {
    const key = `${s.city}|${s.date}`;

    if (!groups[key]) {
      groups[key] = {
        city: s.city,
        date: s.date,
        users: [],
      };
    }

    if (!groups[key].users.includes(s.user_email)) {
      groups[key].users.push(s.user_email);
    }
  });

  const result = Object.values(groups).filter(
    (g) => g.users.length > 1
  );

  setMatches(result);
}



  useEffect(() => {
    const user = localStorage.getItem("dev_user");
    if (user) {
      setEmail(user);
      setLogged(true);
      loadStays();
      function calculateMatches(stays) {
  const groups = {};

  stays.forEach((s) => {
    const key = `${s.city}|${s.date}`;
    if (!groups[key]) {
      groups[key] = {
        city: s.city,
        date: s.date,
        users: [],
      };
    }
    groups[key].users.push(s.user_email);
  });

  const result = Object.values(groups).filter(
    (g) => g.users.length > 1
  );

  setMatches(result);
}

    }
  }, []);

  async function loadStays() {
  const { data, error } = await supabase
    .from("stays")
    .select("*")
    .order("date");

  if (!error) {
    setStays(data);
    calculateMatches(data);
  }
}


  async function saveStay() {
    const { error } = await supabase.from("stays").insert([
      { user_email: email, city, date }
    ]);

    if (!error) {
      setCity("");
      setDate("");
      loadStays();
    }
  }

  if (!logged) {
    return (
      <main style={{ padding: 20 }}>
        <h1>✈️ Crew Match</h1>
        <input
          placeholder="Seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={() => {
          localStorage.setItem("dev_user", email);
          setLogged(true);
        }}>
          Entrar (dev)
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>✈️ Crew Match</h1>
      <p>Logado como: {email}</p>
      <hr />

<h3>📎 Enviar escala</h3>

<input
  type="file"
  accept="image/*,.pdf"
  onChange={(e) => setFile(e.target.files[0])}
/>

<button onClick={uploadScale} style={{ marginTop: 10 }}>
  Enviar escala para IA
</button>

<hr />

      <button
  onClick={() => {
    localStorage.removeItem("dev_user");
    location.reload();
  }}
>
  Trocar usuário
</button>

<hr />


      <h3>Novo pernoite</h3>
      <input
        placeholder="Cidade"
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
      <h3>🤝 Matches de pernoite</h3>

{matches.length === 0 && <p>Nenhum match ainda</p>}

{matches.map((m, index) => (
  <div key={index} style={{ marginBottom: 10 }}>
    <strong>📍 {m.city} — {m.date}</strong>
    <ul>
      {m.users.map((u, i) => (
        <li key={i}>{u}</li>
      ))}
    </ul>
  </div>
))}


      <h3>Pernoites cadastrados</h3>
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
