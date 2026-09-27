import express from "express";
import { supabase } from "../supabaseClient.js";
import { generarCodigoUnico } from "../codigoEncuestado.js";

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

    const { data, error } = await supabase
      .from("participantes")
      .insert({
        codigo_encuestado: codigo,
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

    if (data.estado === "completado") {
      return res.status(409).json({
        error: "Este código de encuestado ya completó el estudio y no puede reutilizarse.",
        participante: data,
      });
    }

    res.json({ participante: data });
  } catch (err) {
    console.error("Error consultando participante:", err);
    res.status(500).json({ error: "No se pudo consultar al participante." });
  }
});
