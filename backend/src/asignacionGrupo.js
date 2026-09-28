import { supabase } from "./supabaseClient.js";

const GRUPOS = ["imagenes", "palabra", "definicion"];

/**
 * Asigna a un participante nuevo el grupo de entrenamiento que tenga
 * MENOS participantes asignados hasta ahora (round-robin real basado en
 * conteo, no en un índice rotativo en memoria — así funciona correctamente
 * incluso si el servidor se reinicia entre registros).
 *
 * En caso de empate entre grupos, se elige el primero en el orden de GRUPOS,
 * lo cual mantiene el balance determinístico y predecible.
 */
export async function asignarGrupoEntrenamiento() {
  const { data, error } = await supabase.from("participantes").select("grupo_entrenamiento");

  if (error) throw error;

  const conteos = { imagenes: 0, palabra: 0, definicion: 0 };
  for (const fila of data ?? []) {
    if (fila.grupo_entrenamiento in conteos) {
      conteos[fila.grupo_entrenamiento]++;
    }
  }

  let grupoConMenos = GRUPOS[0];
  for (const grupo of GRUPOS) {
    if (conteos[grupo] < conteos[grupoConMenos]) {
      grupoConMenos = grupo;
    }
  }

  return grupoConMenos;
}
