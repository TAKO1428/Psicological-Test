import express from "express";
import { supabase } from "../supabaseClient.js";
import { generarPlanFase, posicionCorrectaTrasBarajar } from "../aleatorizacion.js";

export const router = express.Router();

const FASES_VALIDAS = ["preprueba", "entrenamiento", "postprueba"];

// nombre del flag en `participantes` que marca cada fase como completada
const FLAG_COMPLETADA = {
  preprueba: "preprueba_completada",
  entrenamiento: "entrenamiento_completado",
  postprueba: "postprueba_completada",
};

// para pedir la fase X, ¿qué fase previa debe estar completada? null = sin requisito
const REQUISITO_PREVIO = {
  preprueba: null,
  entrenamiento: "preprueba",
  postprueba: "entrenamiento",
};

function validarFase(fase, res) {
  if (!FASES_VALIDAS.includes(fase)) {
    res.status(400).json({ error: `Fase inválida: ${fase}` });
    return false;
  }
  return true;
}

async function obtenerParticipante(participanteId) {
  const { data, error } = await supabase
    .from("participantes")
    .select("*")
    .eq("id", participanteId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * POST /api/fases/:fase/iniciar
 * body: { participanteId }
 *
 * Crea (si no existe ya) la sesión de esta fase para el participante,
 * con el orden de items y ecos ya fijado. Si ya existía (ej. recargó
 * la página), simplemente la devuelve sin regenerar el orden.
 *
 * Aplica el desbloqueo progresivo del menú: no permite iniciar
 * "entrenamiento" si "preprueba" no está completada, ni "postprueba" si
 * "entrenamiento" no está completado.
 */
router.post("/:fase/iniciar", async (req, res) => {
  try {
    const { fase } = req.params;
    const { participanteId } = req.body;
    if (!validarFase(fase, res)) return;

    const participante = await obtenerParticipante(participanteId);

    const requisito = REQUISITO_PREVIO[fase];
    if (requisito && !participante[FLAG_COMPLETADA[requisito]]) {
      return res.status(403).json({
        error: `Debes completar "${requisito}" antes de comenzar "${fase}".`,
      });
    }

    // ¿ya existe una sesión de esta fase para este participante?
    const { data: existente, error: errBuscar } = await supabase
      .from("sesiones_fase")
      .select("*")
      .eq("participante_id", participanteId)
      .eq("fase", fase)
      .maybeSingle();

    if (errBuscar) throw errBuscar;

    if (existente) {
      return res.json({ sesion: existente, reanudada: true });
    }

    if (participante[FLAG_COMPLETADA[fase]]) {
      return res.status(409).json({
        error: `Ya completaste "${fase}" anteriormente y no puede repetirse.`,
      });
    }

    // traer items activos de esta fase; si es entrenamiento, SOLO los de
    // su grupo asignado (imagenes | palabra | definicion)
    let consulta = supabase
      .from("items")
      .select("id, ecos_validos")
      .eq("fase", fase)
      .eq("activo", true);
    if (fase === "entrenamiento") {
      consulta = consulta.eq("grupo_entrenamiento", participante.grupo_entrenamiento);
    }
    const { data: items, error: errItems } = await consulta;

    if (errItems) throw errItems;
    if (!items || items.length === 0) {
      return res.status(409).json({
        error: `No hay items cargados para la fase "${fase}" todavía.`,
      });
    }

    const { ordenItems, ordenEcos } = generarPlanFase(items);

    const { data: nuevaSesion, error: errCrear } = await supabase
      .from("sesiones_fase")
      .insert({
        participante_id: participanteId,
        fase,
        orden_items: ordenItems,
        orden_ecos: ordenEcos,
        posicion_actual: 0,
      })
      .select()
      .single();

    if (errCrear) throw errCrear;

    res.status(201).json({ sesion: nuevaSesion, reanudada: false });
  } catch (err) {
    console.error("Error iniciando fase:", err);
    res.status(500).json({ error: "No se pudo iniciar la fase." });
  }
});

/**
 * GET /api/fases/:fase/siguiente-item?participanteId=123
 *
 * Devuelve el siguiente ítem pendiente de esta fase para el participante,
 * con los ecos YA en el orden barajado que le corresponde, y SIN revelar
 * cuál es la respuesta correcta. Si el contenido es de tipo "imagen",
 * devuelve la URL relativa dentro de assets/entrenamiento-imagenes/.
 *
 * Si ya no hay más items, responde { terminada: true }.
 */
router.get("/:fase/siguiente-item", async (req, res) => {
  try {
    const { fase } = req.params;
    const { participanteId } = req.query;
    if (!validarFase(fase, res)) return;

    const { data: sesion, error: errSesion } = await supabase
      .from("sesiones_fase")
      .select("*")
      .eq("participante_id", participanteId)
      .eq("fase", fase)
      .maybeSingle();

    if (errSesion) throw errSesion;
    if (!sesion) {
      return res.status(404).json({ error: "No se ha iniciado esta fase para este participante." });
    }

    const { orden_items, orden_ecos, posicion_actual } = sesion;

    if (posicion_actual >= orden_items.length) {
      return res.json({ terminada: true });
    }

    const itemId = orden_items[posicion_actual];

    const { data: item, error: errItem } = await supabase
      .from("items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (errItem) throw errItem;

    const ecosOriginales = [item.eco_1, item.eco_2, item.eco_3, item.eco_4];
    const barajado = orden_ecos[itemId]; // ej. [2,0,1] si ecos_validos=3, o [2,0,3,1] si son 4
    const ecosParaMostrar = barajado
      .map((idxOriginal) => ecosOriginales[idxOriginal])
      .filter((valor) => valor !== null && valor !== undefined);

    res.json({
      terminada: false,
      posicionEnSecuencia: posicion_actual + 1, // 1-based, para mostrar "pregunta X de N"
      totalEnFase: orden_items.length,
      item: {
        id: item.id,
        relacion: item.relacion,
        tipoContenido: item.tipo_contenido, // "texto" | "imagen" — describe los ECOS
        tipoContenidoMuestra: item.tipo_contenido_muestra, // "texto" | "imagen" — describe la MUESTRA
        ejemploSelector1: item.ejemplo_selector_1,
        ejemploSelector2: item.ejemplo_selector_2,
        muestra: item.muestra,
        ecos: ecosParaMostrar, // ya en el orden que le toca ver a este participante (3 o 4 elementos)
        // NUNCA se envía indice_correcto aquí
      },
    });
  } catch (err) {
    console.error("Error obteniendo siguiente item:", err);
    res.status(500).json({ error: "No se pudo obtener el siguiente ítem." });
  }
});

/**
 * POST /api/fases/:fase/responder
 * body: { participanteId, itemId, indiceRespondido, tiempoRespuestaMs }
 *
 * Valida la respuesta del lado del servidor, guarda el ensayo, y avanza
 * el puntero de la sesión. Al terminar la fase, marca el flag de esa fase
 * como completada en `participantes` (para el menú con desbloqueo).
 */
router.post("/:fase/responder", async (req, res) => {
  try {
    const { fase } = req.params;
    const { participanteId, itemId, indiceRespondido, tiempoRespuestaMs } = req.body;
    if (!validarFase(fase, res)) return;

    const { data: sesion, error: errSesion } = await supabase
      .from("sesiones_fase")
      .select("*")
      .eq("participante_id", participanteId)
      .eq("fase", fase)
      .maybeSingle();

    if (errSesion) throw errSesion;
    if (!sesion) {
      return res.status(404).json({ error: "No se ha iniciado esta fase para este participante." });
    }

    const { data: item, error: errItem } = await supabase
      .from("items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (errItem) throw errItem;

    const ordenBarajadoDeEsteItem = sesion.orden_ecos[itemId];
    const indiceCorrectoMostrado = posicionCorrectaTrasBarajar(
      item.indice_correcto,
      ordenBarajadoDeEsteItem
    );
    const esCorrecto = indiceRespondido === indiceCorrectoMostrado;

    const posicionEnSecuencia = sesion.posicion_actual + 1;

    const { error: errEnsayo } = await supabase.from("ensayos").insert({
      participante_id: participanteId,
      sesion_fase_id: sesion.id,
      item_id: itemId,
      fase,
      posicion_en_secuencia: posicionEnSecuencia,
      indice_correcto_mostrado: indiceCorrectoMostrado,
      indice_respondido: indiceRespondido,
      correcto: esCorrecto,
      tiempo_respuesta_ms: tiempoRespuestaMs ?? null,
      respondido_en: new Date().toISOString(),
    });

    if (errEnsayo) throw errEnsayo;

    const nuevaPosicion = sesion.posicion_actual + 1;
    const faseTerminada = nuevaPosicion >= sesion.orden_items.length;

    const actualizacionSesion = { posicion_actual: nuevaPosicion };
    if (faseTerminada) {
      actualizacionSesion.completada_en = new Date().toISOString();
    }

    await supabase.from("sesiones_fase").update(actualizacionSesion).eq("id", sesion.id);

    if (faseTerminada) {
      const actualizacionParticipante = { [FLAG_COMPLETADA[fase]]: true };
      // si además ya completó las 3 fases, marcar estado general como completado
      const participanteActual = await obtenerParticipante(participanteId);
      const yaCompletoTodo =
        (fase === "preprueba" ? true : participanteActual.preprueba_completada) &&
        (fase === "entrenamiento" ? true : participanteActual.entrenamiento_completado) &&
        (fase === "postprueba" ? true : participanteActual.postprueba_completada);

      if (yaCompletoTodo) {
        actualizacionParticipante.estado = "completado";
      }

      await supabase.from("participantes").update(actualizacionParticipante).eq("id", participanteId);
    }

    // En Pre-prueba y Post-prueba NO se revela si la respuesta fue correcta,
    // ni siquiera en la respuesta de la API (así no se puede ver desde la
    // pestaña Network del navegador). Solo Entrenamiento devuelve `correcto`.
    const respuestaApi = { faseTerminada };
    if (fase === "entrenamiento") {
      respuestaApi.correcto = esCorrecto;
    }
    res.json(respuestaApi);
  } catch (err) {
    console.error("Error registrando respuesta:", err);
    res.status(500).json({ error: "No se pudo registrar la respuesta." });
  }
});
