import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
// Usamos la service_role key porque el backend necesita escribir sin
// las restricciones de Row Level Security que aplicarían a un cliente público.
// Esta llave NUNCA debe exponerse al frontend.
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  throw new Error(
    "Faltan variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_KEY"
  );
}

export const supabase = createClient(url, key);
