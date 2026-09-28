/**
 * Lógica de aleatorización para cada participante.
 *
 * Dos capas distintas de aleatorización, que se calculan UNA SOLA VEZ
 * por participante/fase y se guardan en `sesiones_fase` para que no
 * cambien si la persona recarga la página:
 *
 *   1. Orden de los ítems dentro de la fase (orden_items)
 *   2. Posición de los 4 ecos dentro de cada ítem (orden_ecos)
 *
 * Barajar la posición de los ecos es importante para que la respuesta
 * correcta no caiga siempre en el mismo lugar (sesgo posicional).
 */

/** Fisher-Yates shuffle, no muta el array original. */
function barajar(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Genera el plan completo de una fase para un participante nuevo.
 *
 * @param {Array<{id: number, ecos_validos?: number}>} items - items activos de esa fase
 * @returns {{ordenItems: number[], ordenEcos: Record<string, number[]>}}
 */
export function generarPlanFase(items) {
  const ordenItems = barajar(items.map((it) => it.id));

  const ordenEcos = {};
  for (const item of items) {
    // items normales barajan [0,1,2,3]; items con solo 3 opciones válidas
    // (eco_4 es null en la BD) barajan únicamente [0,1,2], para nunca
    // mostrar una cuarta posición vacía.
    const n = item.ecos_validos ?? 4;
    const indices = Array.from({ length: n }, (_, i) => i);
    ordenEcos[item.id] = barajar(indices);
  }

  return { ordenItems, ordenEcos };
}

/**
 * Dado el índice correcto original (0-3, referido a eco_1..eco_4 en la BD)
 * y el arreglo de barajado de ese ítem, devuelve en qué posición visual
 * quedó la respuesta correcta para este participante.
 */
export function posicionCorrectaTrasBarajar(indiceCorrectoOriginal, ordenBarajado) {
  return ordenBarajado.indexOf(indiceCorrectoOriginal);
}
