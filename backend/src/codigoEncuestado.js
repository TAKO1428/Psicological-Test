import { supabase } from "./supabaseClient.js";

/**
 * Genera un código de encuestado único, ej. "ENC-0001".
 * Se genera del lado del servidor (no lo escribe el participante) para
 * evitar duplicados intencionales o accidentales.
 *
 * Estrategia: contar cuántos participantes existen y usar el siguiente
 * número, con un reintento en caso de colisión (muy improbable, pero
 * cubre el caso de dos registros casi simultáneos).
 */
export async function generarCodigoUnico() {
  const MAX_INTENTOS = 5;

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const { count, error } = await supabase
      .from("participantes")
      .select("*", { count: "exact", head: true });

    if (error) throw error;

    const siguiente = (count ?? 0) + 1 + intento; // +intento evita reintentar el mismo número
    const codigo = `ENC-${String(siguiente).padStart(4, "0")}`;

    const { data: existente } = await supabase
      .from("participantes")
      .select("id")
      .eq("codigo_encuestado", codigo)
      .maybeSingle();

    if (!existente) {
      return codigo;
    }
    // si existe, el for reintenta con el siguiente número
  }

  throw new Error("No se pudo generar un código de encuestado único tras varios intentos");
}
