import { supabase } from "./supabaseClient.js";

const GRUPOS_ENTRENAMIENTO = ["imagenes", "palabra", "definicion"];

/**
 * Asigna el grupo de entrenamiento con MENOS participantes hasta ahora
 * (round-robin balanceado). Si hay empate, se queda con el primero de
 * GRUPOS_ENTRENAMIENTO en ese empate, lo cual mantiene el balanceo estable.
 *
 * Se apoya en una consulta agregada en vez de mantener un contador aparte,
 * así siempre refleja el estado real de la tabla incluso si algo se corrigió
 * manualmente en Supabase.
 */
export async function asignarGrupoBalanceado() {
  const { data, error } = await supabase.from("participantes").select("grupo_entrenamiento");

  if (error) throw error;

  const conteo = { imagenes: 0, palabra: 0, definicion: 0 };
  for (const fila of data ?? []) {
    if (fila.grupo_entrenamiento in conteo) {
      conteo[fila.grupo_entrenamiento]++;
    }
  }

  let grupoElegido = GRUPOS_ENTRENAMIENTO[0];
  for (const grupo of GRUPOS_ENTRENAMIENTO) {
    if (conteo[grupo] < conteo[grupoElegido]) {
      grupoElegido = grupo;
    }
  }

  return grupoElegido;
}

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
