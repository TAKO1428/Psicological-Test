import express from "express";
import { supabase } from "../supabaseClient.js";
import { generarCodigoUnico } from "../codigoEncuestado.js";
import { asignarGrupoEntrenamiento } from "../asignacionGrupo.js";

export const router = express.Router();

/**
 * POST /api/participantes
 * Crea un nuevo participante: le asigna un código único generado por el
 * servidor y un grupo de entrenamiento balanceado (round-robin).
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

    const [codigo, grupoEntrenamiento] = await Promise.all([
      generarCodigoUnico(),
      asignarGrupoEntrenamiento(),
    ]);

    const { data, error } = await supabase
      .from("participantes")
      .insert({
        codigo_encuestado: codigo,
        token_dispositivo: tokenDispositivo ?? null,
        consentimiento_aceptado: true,
        estado: "en_curso",
        fase_actual: null, // ya no se autoavanza; el participante elige desde el menú
        grupo_entrenamiento: grupoEntrenamiento,
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
 * Recupera el estado de un participante existente: qué fases ya completó
 * (para el menú con desbloqueo progresivo) y su grupo de entrenamiento.
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

    res.json({ participante: data });
  } catch (err) {
    console.error("Error consultando participante:", err);
    res.status(500).json({ error: "No se pudo consultar al participante." });
  }
});
