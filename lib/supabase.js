import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://wxtfavvstlvltdtxntaw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4dGZhdnZzdGx2bHRkdHhudGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODEwMTUsImV4cCI6MjA4NjU1NzAxNX0.Am1fuviA1dityKYzXjAzel8DOrtsYSrw-kCO-xlXdQg"
);
