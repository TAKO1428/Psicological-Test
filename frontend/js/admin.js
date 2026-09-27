import * as api from "./api.js";
import { API_URL } from "./config.js";

const raiz = document.getElementById("admin-app");

const ETIQUETA_FASE = {
  preprueba: "Pre-prueba",
  entrenamiento: "Entrenamiento",
  postprueba: "Post-prueba",
};

const NOMBRE_GRUPO = {
  imagenes: "Fotografías",
  palabra: "Palabra",
  definicion: "Definición",
};

let vistaActual = "general";
let datosGlobales = null;

async function cargarPanel() {
  try {
    const [{ participantes }, desglose, comparacion] = await Promise.all([
      api.obtenerListaParticipantesAdmin(),
      api.obtenerDesgloseGeneralAdmin(),
      api.obtenerComparacionGruposAdmin(),
    ]);
    datosGlobales = { participantes, desglose, comparacion };
    renderPanel();
  } catch (err) {
    raiz.innerHTML = `<p class="admin-error">No se pudo cargar el panel: ${err.message}</p>`;
  }
}

function cambiarVista(vista) {
  vistaActual = vista;
  renderPanel();
}

function renderPanel() {
  const { participantes, desglose, comparacion } = datosGlobales;

  raiz.innerHTML = `
    <header class="admin-encabezado">
      <h1>Panel de administrador</h1>
      <a class="admin-boton-secundario" href="${API_URL}/admin/exportar-csv" target="_blank">
        Exportar CSV
      </a>
    </header>

    <nav class="admin-tabs">
      <button class="admin-tab ${vistaActual === "general" ? "admin-tab-activo" : ""}" data-vista="general">
        Vista general
      </button>
      <button class="admin-tab ${vistaActual === "grupos" ? "admin-tab-activo" : ""}" data-vista="grupos">
        Comparación de grupos
      </button>
      <button class="admin-tab ${vistaActual === "participantes" ? "admin-tab-activo" : ""}" data-vista="participantes">
        Participantes
      </button>
    </nav>

    <div id="admin-contenido"></div>
  `;

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => cambiarVista(btn.dataset.vista));
  });

  const contenedor = document.getElementById("admin-contenido");
  if (vistaActual === "general") {
    contenedor.innerHTML = vistaGeneral(desglose);
  } else if (vistaActual === "grupos") {
    contenedor.innerHTML = vistaGrupos(comparacion);
  } else {
    contenedor.innerHTML = vistaParticipantes(participantes);
    document.querySelectorAll(".fila-participante").forEach((fila) => {
      fila.addEventListener("click", () => mostrarDetalleParticipante(fila.dataset.id));
    });
  }
}

function vistaGeneral(desglose) {
  return `
    <section class="admin-resumen-fases">
      ${["preprueba", "entrenamiento", "postprueba"]
        .map(
          (fase) => `
        <div class="admin-tarjeta-metrica">
          <p class="admin-metrica-etiqueta">${ETIQUETA_FASE[fase]} — % acierto promedio</p>
          <p class="admin-metrica-valor">
            ${desglose.promedioAciertoPorFase[fase] ?? "—"}${desglose.promedioAciertoPorFase[fase] != null ? "%" : ""}
          </p>
        </div>
      `
        )
        .join("")}
    </section>

    <section class="admin-seccion">
      <h2>Ítems con más errores</h2>
      <p class="admin-seccion-nota">Ítems donde los participantes fallan más — útil para revisar si el ítem está mal planteado.</p>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Fase</th>
            <th>Grupo</th>
            <th>Relación</th>
            <th>Muestra</th>
            <th>Presentado</th>
            <th>% Acierto</th>
          </tr>
        </thead>
        <tbody>
          ${desglose.itemsMasDificiles.map(filaItem).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function vistaGrupos(comparacion) {
  const { comparacionGrupos, detallePorParticipante } = comparacion;

  // encontrar el grupo con mayor ganancia promedio para destacarlo
  const mejores = [...comparacionGrupos]
    .filter((g) => g.ganancia_promedio != null)
    .sort((a, b) => b.ganancia_promedio - a.ganancia_promedio);
  const mejorGrupo = mejores[0]?.grupo_entrenamiento;

  return `
    <section class="admin-seccion">
      <h2>¿Qué entrenamiento funciona mejor?</h2>
      <p class="admin-seccion-nota">
        Ganancia = % de aciertos en Post-prueba menos % de aciertos en Pre-prueba.
        Un valor más alto indica mayor mejora atribuible al entrenamiento.
      </p>
      <div class="admin-grid-grupos">
        ${["imagenes", "palabra", "definicion"]
          .map((grupo) => {
            const g = comparacionGrupos.find((c) => c.grupo_entrenamiento === grupo);
            const esMejor = grupo === mejorGrupo;
            return `
            <div class="admin-tarjeta-grupo ${esMejor ? "admin-tarjeta-grupo-destacada" : ""}">
              ${esMejor ? '<span class="admin-insignia">Mejor resultado</span>' : ""}
              <p class="admin-grupo-nombre">${NOMBRE_GRUPO[grupo]}</p>
              <p class="admin-grupo-ganancia">
                ${g?.ganancia_promedio != null ? (g.ganancia_promedio > 0 ? "+" : "") + g.ganancia_promedio + "%" : "—"}
              </p>
              <p class="admin-grupo-detalle">
                Pre: ${g?.promedio_pre ?? "—"}% · Entren: ${g?.promedio_entrenamiento ?? "—"}% · Post: ${g?.promedio_post ?? "—"}%
              </p>
              <p class="admin-grupo-n">${g?.n_participantes ?? 0} participantes (${g?.n_con_pre_y_post ?? 0} con pre y post)</p>
            </div>
          `;
          })
          .join("")}
      </div>
    </section>

    <section class="admin-seccion">
      <h2>Detalle por participante</h2>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Grupo</th>
            <th>% Pre</th>
            <th>% Entren.</th>
            <th>% Post</th>
            <th>Ganancia</th>
          </tr>
        </thead>
        <tbody>
          ${detallePorParticipante.map(filaGanancia).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function vistaParticipantes(participantes) {
  return `
    <section class="admin-seccion">
      <h2>Participantes (${participantes.length})</h2>
      <p class="admin-seccion-nota">Clic en una fila para ver el detalle ensayo por ensayo.</p>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Grupo</th>
            <th>Estado</th>
            <th>Fase actual</th>
            <th>% Pre</th>
            <th>% Entren.</th>
            <th>% Post</th>
            <th>Registrado</th>
          </tr>
        </thead>
        <tbody>
          ${participantes.map(filaParticipante).join("")}
        </tbody>
      </table>
    </section>
    <div id="admin-detalle-modal"></div>
  `;
}

async function mostrarDetalleParticipante(id) {
  const modal = document.getElementById("admin-detalle-modal");
  modal.innerHTML = `<div class="admin-modal-fondo"><div class="admin-modal"><p>Cargando...</p></div></div>`;
  try {
    const { ensayos } = await api.obtenerDetalleParticipanteAdmin(id);
    modal.innerHTML = `
      <div class="admin-modal-fondo" id="admin-modal-fondo">
        <div class="admin-modal">
          <button class="admin-modal-cerrar" id="admin-modal-cerrar">✕</button>
          <h2>Detalle del participante</h2>
          <table class="admin-tabla admin-tabla-compacta">
            <thead>
              <tr><th>Fase</th><th>#</th><th>Relación</th><th>Muestra</th><th>Correcto</th><th>Tiempo (ms)</th></tr>
            </thead>
            <tbody>
              ${ensayos
                .map(
                  (e) => `
                <tr>
                  <td>${ETIQUETA_FASE[e.fase] ?? e.fase}</td>
                  <td>${e.posicion_en_secuencia}</td>
                  <td>${e.items?.relacion ?? ""}</td>
                  <td>${e.items?.muestra ?? ""}</td>
                  <td>${e.correcto ? "✓" : "✕"}</td>
                  <td>${e.tiempo_respuesta_ms ?? "—"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById("admin-modal-cerrar").addEventListener("click", () => (modal.innerHTML = ""));
    document.getElementById("admin-modal-fondo").addEventListener("click", (e) => {
      if (e.target.id === "admin-modal-fondo") modal.innerHTML = "";
    });
  } catch (err) {
    modal.innerHTML = `<div class="admin-modal-fondo"><div class="admin-modal"><p class="admin-error">${err.message}</p></div></div>`;
  }
}

function filaParticipante(p) {
  const pre = p.fases.preprueba?.porcentajeCorrecto;
  const ent = p.fases.entrenamiento?.porcentajeCorrecto;
  const post = p.fases.postprueba?.porcentajeCorrecto;
  const fecha = new Date(p.creadoEn).toLocaleDateString("es-MX");

  return `
    <tr class="fila-participante" data-id="${p.id}">
      <td>${p.codigoEncuestado}</td>
      <td><span class="admin-chip-grupo">${NOMBRE_GRUPO[p.grupoEntrenamiento] ?? "—"}</span></td>
      <td><span class="admin-estado admin-estado-${p.estado}">${p.estado}</span></td>
      <td>${ETIQUETA_FASE[p.faseActual] ?? p.faseActual ?? "—"}</td>
      <td>${pre != null ? pre + "%" : "—"}</td>
      <td>${ent != null ? ent + "%" : "—"}</td>
      <td>${post != null ? post + "%" : "—"}</td>
      <td>${fecha}</td>
    </tr>
  `;
}

function filaItem(it) {
  return `
    <tr>
      <td>${ETIQUETA_FASE[it.fase] ?? it.fase}</td>
      <td>${it.grupo_entrenamiento ? NOMBRE_GRUPO[it.grupo_entrenamiento] : "—"}</td>
      <td>${it.relacion}</td>
      <td>${it.tipo_contenido === "imagen" ? "🖼 " : ""}${it.muestra}</td>
      <td>${it.veces_presentado}</td>
      <td>${it.porcentaje_acierto != null ? it.porcentaje_acierto + "%" : "—"}</td>
    </tr>
  `;
}

function filaGanancia(g) {
  const ganancia = g.ganancia_pre_post;
  let claseGanancia = "";
  if (ganancia != null) {
    claseGanancia = ganancia > 0 ? "admin-ganancia-positiva" : ganancia < 0 ? "admin-ganancia-negativa" : "";
  }
  return `
    <tr>
      <td>${g.codigo_encuestado}</td>
      <td><span class="admin-chip-grupo">${NOMBRE_GRUPO[g.grupo_entrenamiento] ?? "—"}</span></td>
      <td>${g.porcentaje_pre != null ? g.porcentaje_pre + "%" : "—"}</td>
      <td>${g.porcentaje_entrenamiento != null ? g.porcentaje_entrenamiento + "%" : "—"}</td>
      <td>${g.porcentaje_post != null ? g.porcentaje_post + "%" : "—"}</td>
      <td class="${claseGanancia}">${ganancia != null ? (ganancia > 0 ? "+" : "") + ganancia + "%" : "—"}</td>
    </tr>
  `;
}

cargarPanel();
