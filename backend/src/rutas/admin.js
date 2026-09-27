import express from "express";
import { supabase } from "../supabaseClient.js";

export const router = express.Router();

/**
 * GET /api/admin/participantes
 * Lista todos los participantes con su estado y avance general.
 * Usa la vista `resumen_participante_fase` para traer % de aciertos por fase.
 */
router.get("/participantes", async (req, res) => {
  try {
    const { data: participantes, error: errP } = await supabase
      .from("participantes")
      .select("*")
      .order("creado_en", { ascending: false });

    if (errP) throw errP;

    const { data: resumenes, error: errR } = await supabase
      .from("resumen_participante_fase")
      .select("*");

    if (errR) throw errR;

    const porParticipante = participantes.map((p) => {
      const fasesDeEste = resumenes.filter((r) => r.participante_id === p.id);
      const porFase = {};
      for (const f of fasesDeEste) {
        porFase[f.fase] = {
          totalRespondidas: f.total_respondidas,
          totalCorrectas: f.total_correctas,
          porcentajeCorrecto: f.porcentaje_correcto,
          tiempoPromedioMs: f.tiempo_promedio_ms,
        };
      }
      return {
        id: p.id,
        codigoEncuestado: p.codigo_encuestado,
        estado: p.estado,
        faseActual: p.fase_actual,
        creadoEn: p.creado_en,
        fases: porFase,
      };
    });

    res.json({ participantes: porParticipante });
  } catch (err) {
    console.error("Error listando participantes:", err);
    res.status(500).json({ error: "No se pudo obtener el listado de participantes." });
  }
});

/**
 * GET /api/admin/participantes/:id/detalle
 * Devuelve el detalle ensayo-por-ensayo de un participante específico,
 * útil para revisar a alguien puntual (ej. quién respondió qué y cuándo).
 */
router.get("/participantes/:id/detalle", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: ensayos, error } = await supabase
      .from("ensayos")
      .select("*, items(muestra, relacion, eco_1, eco_2, eco_3, eco_4)")
      .eq("participante_id", id)
      .order("fase", { ascending: true })
      .order("posicion_en_secuencia", { ascending: true });

    if (error) throw error;

    res.json({ ensayos });
  } catch (err) {
    console.error("Error obteniendo detalle del participante:", err);
    res.status(500).json({ error: "No se pudo obtener el detalle." });
  }
});

/**
 * GET /api/admin/desglose-general
 * Métricas agregadas de TODOS los participantes: promedio de aciertos
 * por fase y por ítem (para detectar ítems problemáticos).
 */
router.get("/desglose-general", async (req, res) => {
  try {
    const { data: porItem, error: errItem } = await supabase
      .from("resumen_item")
      .select("*")
      .order("porcentaje_acierto", { ascending: true });

    if (errItem) throw errItem;

    const { data: porFase, error: errFase } = await supabase
      .from("resumen_participante_fase")
      .select("fase, porcentaje_correcto");

    if (errFase) throw errFase;

    const promediosPorFase = {};
    for (const fase of ["preprueba", "entrenamiento", "postprueba"]) {
      const valores = porFase.filter((r) => r.fase === fase).map((r) => r.porcentaje_correcto);
      promediosPorFase[fase] =
        valores.length > 0
          ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10
          : null;
    }

    res.json({
      promedioAciertoPorFase: promediosPorFase,
      itemsMasDificiles: porItem.slice(0, 10), // los 10 con menor % de acierto
      todosLosItems: porItem,
    });
  } catch (err) {
    console.error("Error obteniendo desglose general:", err);
    res.status(500).json({ error: "No se pudo obtener el desglose general." });
  }
});

/**
 * GET /api/admin/exportar-csv
 * Exporta todos los ensayos en formato CSV para análisis externo (SPSS/R/Excel).
 */
router.get("/exportar-csv", async (req, res) => {
  try {
    const { data: ensayos, error } = await supabase
      .from("ensayos")
      .select("*, participantes(codigo_encuestado), items(relacion, muestra)")
      .order("participante_id", { ascending: true });

    if (error) throw error;

    const encabezados = [
      "codigo_encuestado",
      "fase",
      "relacion",
      "muestra",
      "posicion_en_secuencia",
      "indice_correcto_mostrado",
      "indice_respondido",
      "correcto",
      "tiempo_respuesta_ms",
      "respondido_en",
    ];

    const filas = ensayos.map((e) =>
      [
        e.participantes?.codigo_encuestado ?? "",
        e.fase,
        e.items?.relacion ?? "",
        `"${(e.items?.muestra ?? "").replace(/"/g, '""')}"`,
        e.posicion_en_secuencia,
        e.indice_correcto_mostrado,
        e.indice_respondido,
        e.correcto,
        e.tiempo_respuesta_ms,
        e.respondido_en,
      ].join(",")
    );

    const csv = [encabezados.join(","), ...filas].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=ensayos_exportados.csv");
    res.send(csv);
  } catch (err) {
    console.error("Error exportando CSV:", err);
    res.status(500).json({ error: "No se pudo exportar el CSV." });
  }
});
