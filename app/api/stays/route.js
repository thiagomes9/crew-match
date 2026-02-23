import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get("user_email");

  if (!userEmail) {
    return NextResponse.json(
      { error: "user_email é obrigatório" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("stays")
    .select("*")
    .eq("user_email", userEmail)
    .order("date", { ascending: true });

  if (error) {
    console.error("Erro ao buscar stays:", error);
    return NextResponse.json(
      { error: "Erro ao buscar pernoites" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}