import express from "express";
import { supabase } from "../supabaseClient.js";
import { generarCodigoUnico, asignarGrupoBalanceado } from "../codigoEncuestado.js";

export const router = express.Router();

/**
 * POST /api/participantes
 * Crea un nuevo participante y le asigna un código único generado por el servidor.
 * body: { consentimientoAceptado: boolean, tokenDispositivo: string }
 */
router.post("/", async (req, res) => {
  try {
    const { consentimientoAceptado, tokenDispositivo } = req.body;

    if (!consentimientoAceptado) {
      return res.status(400).json({
        error: "Debe aceptar el consentimiento informado antes de continuar.",
      });
    }

    const codigo = await generarCodigoUnico();
    const grupoEntrenamiento = await asignarGrupoBalanceado();

    const { data, error } = await supabase
      .from("participantes")
      .insert({
        codigo_encuestado: codigo,
        grupo_entrenamiento: grupoEntrenamiento,
        token_dispositivo: tokenDispositivo ?? null,
        consentimiento_aceptado: true,
        estado: "en_curso",
        fase_actual: "preprueba",
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ participante: data });
  } catch (err) {
    console.error("Error creando participante:", err);
    res.status(500).json({ error: "No se pudo registrar al participante." });
  }
});

/**
 * GET /api/participantes/:codigo
 * Recupera el estado de un participante existente, para permitir
 * reanudar una sesión interrumpida (mismo código).
 */
router.get("/:codigo", async (req, res) => {
  try {
    const { codigo } = req.params;

    const { data, error } = await supabase
      .from("participantes")
      .select("*")
      .eq("codigo_encuestado", codigo)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: "Código de encuestado no encontrado." });
    }

    // Nota: a diferencia de antes, YA NO bloqueamos aquí a quien completó
    // el estudio -- el menú necesita poder mostrarle su resumen final.
    // El bloqueo real (no poder VOLVER A RESPONDER) vive en /fases/:fase/iniciar,
    // que jamás genera una segunda sesión_fase para la misma fase/participante.
    res.json({ participante: data });
  } catch (err) {
    console.error("Error consultando participante:", err);
    res.status(500).json({ error: "No se pudo consultar al participante." });
  }
});

/**
 * GET /api/participantes/:id/progreso
 * Devuelve qué fases están completadas/desbloqueadas, para pintar el menú.
 * Reglas de desbloqueo:
 *   - Pre-prueba: siempre desbloqueada.
 *   - Entrenamiento: se desbloquea cuando preprueba_completada = true.
 *   - Post-prueba: se desbloquea cuando entrenamiento_completado = true.
 */
router.get("/:id/progreso", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: p, error } = await supabase
      .from("participantes")
      .select(
        "id, codigo_encuestado, grupo_entrenamiento, preprueba_completada, entrenamiento_completado, postprueba_completada, estado"
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    res.json({
      progreso: {
        preprueba: { desbloqueada: true, completada: p.preprueba_completada },
        entrenamiento: {
          desbloqueada: p.preprueba_completada,
          completada: p.entrenamiento_completado,
        },
        postprueba: {
          desbloqueada: p.entrenamiento_completado,
          completada: p.postprueba_completada,
        },
      },
      grupoEntrenamiento: p.grupo_entrenamiento,
      estudioCompletado: p.estado === "completado",
    });
  } catch (err) {
    console.error("Error obteniendo progreso:", err);
    res.status(500).json({ error: "No se pudo obtener el progreso." });
  }
});
