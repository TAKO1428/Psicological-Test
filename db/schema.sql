-- ============================================================
-- Esquema de base de datos: Igualación a la Muestra
-- Motor: PostgreSQL (Supabase)
-- ============================================================

-- Tipos controlados como texto con CHECK, para simplicidad y
-- porque enums de Postgres son más incómodos de alterar después.

-- ------------------------------------------------------------
-- ITEMS: el banco de preguntas, cargado una sola vez desde el Excel
-- ------------------------------------------------------------
CREATE TABLE items (
    id              SERIAL PRIMARY KEY,
    fase            TEXT NOT NULL CHECK (fase IN ('preprueba', 'entrenamiento', 'postprueba')),
    fila_excel      INTEGER,                 -- trazabilidad al excel original
    relacion        TEXT NOT NULL,           -- Semejantes, Opuestos, Inclusión, Exclusión, Color, Tamaño
    ejemplo_selector_1 TEXT,
    ejemplo_selector_2 TEXT,
    muestra         TEXT NOT NULL,
    eco_1           TEXT NOT NULL,
    eco_2           TEXT NOT NULL,
    eco_3           TEXT NOT NULL,
    eco_4           TEXT NOT NULL,
    indice_correcto SMALLINT NOT NULL CHECK (indice_correcto BETWEEN 0 AND 3),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,  -- permite desactivar un item sin borrarlo
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_fase ON items(fase) WHERE activo = TRUE;

-- ------------------------------------------------------------
-- PARTICIPANTES: una fila por persona que hace el estudio
-- ------------------------------------------------------------
CREATE TABLE participantes (
    id                  SERIAL PRIMARY KEY,
    codigo_encuestado   TEXT NOT NULL UNIQUE,   -- ej. "ENC-0001", generado por el servidor
    -- token de sesión/dispositivo para detectar reingresos accidentales, NO es autenticación real
    token_dispositivo   TEXT,
    estado              TEXT NOT NULL DEFAULT 'no_iniciado'
                         CHECK (estado IN ('no_iniciado','en_curso','completado','abandonado')),
    fase_actual         TEXT CHECK (fase_actual IN ('preprueba','entrenamiento','postprueba','finalizado')),
    consentimiento_aceptado BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- SESIONES DE FASE: el orden aleatorizado de items, fijado una vez
-- por participante y por fase, para que no cambie si recarga la página.
-- ------------------------------------------------------------
CREATE TABLE sesiones_fase (
    id              SERIAL PRIMARY KEY,
    participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
    fase            TEXT NOT NULL CHECK (fase IN ('preprueba','entrenamiento','postprueba')),
    -- orden_items: array de IDs de items en el orden que le tocó a ESTE participante
    orden_items     INTEGER[] NOT NULL,
    -- orden_ecos: JSON { "item_id": [posiciones barajadas 0-3] } para no sesgar la posición de la respuesta correcta
    orden_ecos      JSONB NOT NULL,
    posicion_actual INTEGER NOT NULL DEFAULT 0,  -- índice del siguiente item a mostrar
    iniciada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    completada_en   TIMESTAMPTZ,
    UNIQUE (participante_id, fase)
);

-- ------------------------------------------------------------
-- ENSAYOS: un registro por cada respuesta dada (la tabla de métricas)
-- ------------------------------------------------------------
CREATE TABLE ensayos (
    id                  SERIAL PRIMARY KEY,
    participante_id     INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
    sesion_fase_id      INTEGER NOT NULL REFERENCES sesiones_fase(id) ON DELETE CASCADE,
    item_id             INTEGER NOT NULL REFERENCES items(id),
    fase                TEXT NOT NULL CHECK (fase IN ('preprueba','entrenamiento','postprueba')),
    posicion_en_secuencia INTEGER NOT NULL,      -- 1-based, orden real en que lo vio este participante
    indice_correcto_mostrado SMALLINT NOT NULL,  -- dónde quedó la respuesta correcta tras barajar ecos (0-3)
    indice_respondido   SMALLINT,                -- qué posición eligió el participante (0-3), NULL si no respondió
    correcto            BOOLEAN,
    tiempo_respuesta_ms INTEGER,
    respondido_en       TIMESTAMPTZ,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (participante_id, item_id, fase)  -- evita doble registro del mismo item/fase para la misma persona
);

CREATE INDEX idx_ensayos_participante ON ensayos(participante_id);
CREATE INDEX idx_ensayos_fase ON ensayos(fase);
CREATE INDEX idx_ensayos_item ON ensayos(item_id);

-- ------------------------------------------------------------
-- Trigger simple para mantener actualizado_en al día en participantes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_participantes_actualizado
BEFORE UPDATE ON participantes
FOR EACH ROW
EXECUTE FUNCTION set_actualizado_en();

-- ------------------------------------------------------------
-- Vista de conveniencia para el panel de administrador:
-- resumen de aciertos por participante y fase
-- ------------------------------------------------------------
CREATE VIEW resumen_participante_fase AS
SELECT
    p.id AS participante_id,
    p.codigo_encuestado,
    e.fase,
    COUNT(*) AS total_respondidas,
    COUNT(*) FILTER (WHERE e.correcto) AS total_correctas,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE e.correcto) / NULLIF(COUNT(*), 0), 1
    ) AS porcentaje_correcto,
    ROUND(AVG(e.tiempo_respuesta_ms)) AS tiempo_promedio_ms
FROM ensayos e
JOIN participantes p ON p.id = e.participante_id
WHERE e.respondido_en IS NOT NULL
GROUP BY p.id, p.codigo_encuestado, e.fase;

-- ------------------------------------------------------------
-- Vista de conveniencia: qué tan difícil es cada item (para detectar
-- ítems problemáticos, no solo participantes problemáticos)
-- ------------------------------------------------------------
CREATE VIEW resumen_item AS
SELECT
    i.id AS item_id,
    i.fase,
    i.relacion,
    i.muestra,
    COUNT(e.id) AS veces_presentado,
    COUNT(e.id) FILTER (WHERE e.correcto) AS veces_correcto,
    ROUND(
        100.0 * COUNT(e.id) FILTER (WHERE e.correcto) / NULLIF(COUNT(e.id), 0), 1
    ) AS porcentaje_acierto
FROM items i
LEFT JOIN ensayos e ON e.item_id = i.id AND e.respondido_en IS NOT NULL
GROUP BY i.id, i.fase, i.relacion, i.muestra;
