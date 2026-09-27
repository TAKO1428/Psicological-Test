import express from "express";
import { supabase } from "../supabaseClient.js";
import { generarPlanFase, posicionCorrectaTrasBarajar } from "../aleatorizacion.js";

export const router = express.Router();

const FASES_VALIDAS = ["preprueba", "entrenamiento", "postprueba"];
const SIGUIENTE_FASE = {
  preprueba: "entrenamiento",
  entrenamiento: "postprueba",
  postprueba: "finalizado",
};

function validarFase(fase, res) {
  if (!FASES_VALIDAS.includes(fase)) {
    res.status(400).json({ error: `Fase inválida: ${fase}` });
    return false;
  }
  return true;
}

/**
 * POST /api/fases/:fase/iniciar
 * body: { participanteId }
 *
 * Crea (si no existe ya) la sesión de esta fase para el participante,
 * con el orden de items y ecos ya fijado. Si ya existía (ej. recargó
 * la página), simplemente la devuelve sin regenerar el orden.
 */
router.post("/:fase/iniciar", async (req, res) => {
  try {
    const { fase } = req.params;
    const { participanteId } = req.body;
    if (!validarFase(fase, res)) return;

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

    // traer items activos de esta fase
    const { data: items, error: errItems } = await supabase
      .from("items")
      .select("id")
      .eq("fase", fase)
      .eq("activo", true);

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

    // actualizar fase_actual del participante
    await supabase
      .from("participantes")
      .update({ fase_actual: fase })
      .eq("id", participanteId);

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
 * cuál es la respuesta correcta.
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
    const barajado = orden_ecos[itemId]; // ej. [2,0,3,1]
    const ecosParaMostrar = barajado.map((idxOriginal) => ecosOriginales[idxOriginal]);

    res.json({
      terminada: false,
      posicionEnSecuencia: posicion_actual + 1, // 1-based, para mostrar "pregunta X de N"
      totalEnFase: orden_items.length,
      item: {
        id: item.id,
        relacion: item.relacion,
        ejemploSelector1: item.ejemplo_selector_1,
        ejemploSelector2: item.ejemplo_selector_2,
        muestra: item.muestra,
        ecos: ecosParaMostrar, // ya en el orden que le toca ver a este participante
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
 * el puntero de la sesión. Devuelve si fue correcta (para feedback inmediato
 * si el diseño lo requiere) y si la fase ya terminó.
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

    const actualizacion = { posicion_actual: nuevaPosicion };
    if (faseTerminada) {
      actualizacion.completada_en = new Date().toISOString();
    }

    await supabase.from("sesiones_fase").update(actualizacion).eq("id", sesion.id);

    // si la fase terminó, actualizar participante (avanzar de fase o marcar completado)
    if (faseTerminada) {
      const siguienteFase = SIGUIENTE_FASE[fase];
      const actualizacionParticipante =
        siguienteFase === "finalizado"
          ? { estado: "completado", fase_actual: "finalizado" }
          : { fase_actual: siguienteFase };

      await supabase
        .from("participantes")
        .update(actualizacionParticipante)
        .eq("id", participanteId);
    }

    res.json({ correcto: esCorrecto, faseTerminada });
  } catch (err) {
    console.error("Error registrando respuesta:", err);
    res.status(500).json({ error: "No se pudo registrar la respuesta." });
  }
});
