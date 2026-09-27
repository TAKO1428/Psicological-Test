import express from "express";
import { supabase } from "../supabaseClient.js";

export const router = express.Router();

const ETIQUETA_GRUPO = {
  imagenes: "Imágenes",
  palabra: "Palabra suelta",
  definicion: "Definición",
};

/**
 * GET /api/admin/participantes
 * Lista todos los participantes con su estado, grupo de entrenamiento y
 * avance por fase (usa la vista `resumen_participante_fase`).
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
        grupoEntrenamiento: p.grupo_entrenamiento,
        grupoEtiqueta: ETIQUETA_GRUPO[p.grupo_entrenamiento] ?? p.grupo_entrenamiento,
        prepruebaCompletada: p.preprueba_completada,
        entrenamientoCompletado: p.entrenamiento_completado,
        postpruebaCompletada: p.postprueba_completada,
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
 * más su ganancia pre->post, para la vista de desglose individual.
 */
router.get("/participantes/:id/detalle", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: participante, error: errP } = await supabase
      .from("participantes")
      .select("*")
      .eq("id", id)
      .single();
    if (errP) throw errP;

    const { data: ensayos, error: errE } = await supabase
      .from("ensayos")
      .select("*, items(muestra, relacion, eco_1, eco_2, eco_3, eco_4, tipo_contenido)")
      .eq("participante_id", id)
      .order("fase", { ascending: true })
      .order("posicion_en_secuencia", { ascending: true });
    if (errE) throw errE;

    const { data: ganancia, error: errG } = await supabase
      .from("ganancia_por_participante")
      .select("*")
      .eq("participante_id", id)
      .maybeSingle();
    if (errG) throw errG;

    res.json({
      participante: {
        id: participante.id,
        codigoEncuestado: participante.codigo_encuestado,
        grupoEntrenamiento: participante.grupo_entrenamiento,
        grupoEtiqueta: ETIQUETA_GRUPO[participante.grupo_entrenamiento] ?? participante.grupo_entrenamiento,
        estado: participante.estado,
      },
      ganancia: ganancia
        ? {
            porcentajePre: ganancia.porcentaje_pre,
            porcentajeEntrenamiento: ganancia.porcentaje_entrenamiento,
            porcentajePost: ganancia.porcentaje_post,
            gananciaPrePost: ganancia.ganancia_pre_post,
          }
        : null,
      ensayos,
    });
  } catch (err) {
    console.error("Error obteniendo detalle del participante:", err);
    res.status(500).json({ error: "No se pudo obtener el detalle." });
  }
});

/**
 * GET /api/admin/comparacion-grupos
 * LA MÉTRICA CLAVE del estudio: compara los 3 grupos de entrenamiento
 * (imágenes / palabra / definición) en % de acierto por fase y, sobre
 * todo, en ganancia promedio pre->post, para responder qué modalidad
 * de entrenamiento funciona mejor.
 */
router.get("/comparacion-grupos", async (req, res) => {
  try {
    const { data, error } = await supabase.from("comparacion_grupos_entrenamiento").select("*");
    if (error) throw error;

    const conEtiqueta = data.map((fila) => ({
      grupo: fila.grupo_entrenamiento,
      grupoEtiqueta: ETIQUETA_GRUPO[fila.grupo_entrenamiento] ?? fila.grupo_entrenamiento,
      nParticipantes: fila.n_participantes,
      nConPreYPost: fila.n_con_pre_y_post,
      promedioPre: fila.promedio_pre,
      promedioEntrenamiento: fila.promedio_entrenamiento,
      promedioPost: fila.promedio_post,
      gananciaPromedio: fila.ganancia_promedio,
      gananciaDesviacion: fila.ganancia_desviacion,
    }));

    // ordenar por ganancia promedio descendente: el "mejor" grupo aparece primero
    conEtiqueta.sort((a, b) => (b.gananciaPromedio ?? -999) - (a.gananciaPromedio ?? -999));

    res.json({ grupos: conEtiqueta });
  } catch (err) {
    console.error("Error obteniendo comparación de grupos:", err);
    res.status(500).json({ error: "No se pudo obtener la comparación de grupos." });
  }
});

/**
 * GET /api/admin/desglose-general
 * Métricas agregadas de TODOS los participantes: promedio de aciertos
 * por fase y por ítem (para detectar ítems problemáticos, con su grupo
 * de entrenamiento cuando aplica).
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
 * Exporta todos los ensayos en formato CSV para análisis externo (SPSS/R/Excel),
 * incluyendo el grupo de entrenamiento de cada participante para poder
 * comparar los 3 grupos directamente en el análisis estadístico.
 */
router.get("/exportar-csv", async (req, res) => {
  try {
    const { data: ensayos, error } = await supabase
      .from("ensayos")
      .select("*, participantes(codigo_encuestado, grupo_entrenamiento), items(relacion, muestra)")
      .order("participante_id", { ascending: true });

    if (error) throw error;

    const encabezados = [
      "codigo_encuestado",
      "grupo_entrenamiento",
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
        e.participantes?.grupo_entrenamiento ?? "",
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
