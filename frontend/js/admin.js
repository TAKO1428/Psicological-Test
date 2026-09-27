import * as api from "./api.js";
import { API_URL } from "./config.js";

const raiz = document.getElementById("admin-app");

const ETIQUETA_FASE = {
  preprueba: "Pre-prueba",
  entrenamiento: "Entrenamiento",
  postprueba: "Post-prueba",
};

let participantesCache = [];

async function cargarPanel() {
  try {
    const [lista, desglose, comparacion] = await Promise.all([
      api.obtenerListaParticipantesAdmin(),
      api.obtenerDesgloseGeneralAdmin(),
      api.obtenerComparacionGruposAdmin(),
    ]);

    console.log("LISTA PARTICIPANTES:", lista);
    console.log("DESGLOSE:", desglose);
    console.log("COMPARACION:", comparacion);

    const { participantes } = lista;

    participantesCache = participantes;
    renderPanel(participantes, desglose, comparacion.grupos);

  } catch (err) {
    console.error("ERROR COMPLETO DEL PANEL:", err);
    console.error("STACK:", err.stack);

    raiz.innerHTML = `
      <p class="admin-error">
        No se pudo cargar el panel: ${err.message}
      </p>
    `;
  }
}

function renderPanel(participantes, desglose, grupos) {
  raiz.innerHTML = `
    <header class="admin-encabezado">
      <h1>Panel de administrador</h1>
      <a class="admin-boton-secundario" href="${API_URL}/admin/exportar-csv" target="_blank">
        Exportar CSV
      </a>
    </header>

    <section class="admin-seccion">
      <h2>Comparación de modalidades de entrenamiento</h2>
      <p class="admin-subtexto">
        Ordenado por ganancia promedio de pre-prueba a post-prueba — la métrica
        clave para saber qué entrenamiento funciona mejor.
      </p>
      <div class="admin-grupos-comparacion">
        ${grupos.map((g, idx) => tarjetaGrupo(g, idx === 0)).join("")}
      </div>
    </section>

    <section class="admin-resumen-fases">
      ${["preprueba", "entrenamiento", "postprueba"]
        .map(
          (fase) => `
        <div class="admin-tarjeta-metrica">
          <p class="admin-metrica-etiqueta">${ETIQUETA_FASE[fase]} — % acierto promedio general</p>
          <p class="admin-metrica-valor">
            ${desglose.promedioAciertoPorFase[fase] ?? "—"}${desglose.promedioAciertoPorFase[fase] != null ? "%" : ""}
          </p>
        </div>
      `
        )
        .join("")}
    </section>

    <section class="admin-seccion">
      <h2>Participantes (${participantes.length})</h2>
      <p class="admin-subtexto">Clic en una fila para ver su desglose individual.</p>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Grupo</th>
            <th>Estado</th>
            <th>% Pre</th>
            <th>% Entren.</th>
            <th>% Post</th>
            <th>Ganancia</th>
            <th>Registrado</th>
          </tr>
        </thead>
        <tbody>
          ${participantes.map(filaParticipante).join("")}
        </tbody>
      </table>
    </section>

    <section class="admin-seccion">
      <h2>Ítems con más errores</h2>
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

    <div id="modal-detalle" class="admin-modal-oculto"></div>
  `;

  document.querySelectorAll(".admin-fila-participante").forEach((fila) => {
    fila.addEventListener("click", () => mostrarDetalleParticipante(fila.dataset.id));
  });
}

function tarjetaGrupo(g, esMejor) {
  const ganancia = g.gananciaPromedio;
  const signo = ganancia > 0 ? "+" : "";
  return `
    <div class="admin-tarjeta-grupo ${esMejor ? "admin-tarjeta-grupo--mejor" : ""}">
      ${esMejor ? `<span class="admin-medalla">🏆 Mejor resultado</span>` : ""}
      <p class="admin-grupo-nombre">${g.grupoEtiqueta}</p>
      <p class="admin-grupo-ganancia">${ganancia != null ? signo + ganancia + " pts" : "—"}</p>
      <p class="admin-grupo-detalle">ganancia promedio pre → post</p>
      <div class="admin-grupo-fila-mini">
        <span>Pre: <strong>${g.promedioPre ?? "—"}%</strong></span>
        <span>Entren.: <strong>${g.promedioEntrenamiento ?? "—"}%</strong></span>
        <span>Post: <strong>${g.promedioPost ?? "—"}%</strong></span>
      </div>
      <p class="admin-grupo-n">n = ${g.nParticipantes} (${g.nConPreYPost} con pre y post)</p>
    </div>
  `;
}

function filaParticipante(p) {
  const pre = p.fases.preprueba?.porcentajeCorrecto;
  const ent = p.fases.entrenamiento?.porcentajeCorrecto;
  const post = p.fases.postprueba?.porcentajeCorrecto;
  const ganancia = pre != null && post != null ? Math.round((post - pre) * 10) / 10 : null;
  const fecha = new Date(p.creadoEn).toLocaleDateString("es-MX");

  return `
    <tr class="admin-fila-participante" data-id="${p.id}">
      <td>${p.codigoEncuestado}</td>
      <td><span class="admin-chip-grupo admin-chip-grupo--${p.grupoEntrenamiento}">${p.grupoEtiqueta}</span></td>
      <td><span class="admin-estado admin-estado-${p.estado}">${p.estado}</span></td>
      <td>${pre != null ? pre + "%" : "—"}</td>
      <td>${ent != null ? ent + "%" : "—"}</td>
      <td>${post != null ? post + "%" : "—"}</td>
      <td>${ganancia != null ? (ganancia > 0 ? "+" : "") + ganancia : "—"}</td>
      <td>${fecha}</td>
    </tr>
  `;
}

function filaItem(it) {
  return `
    <tr>
      <td>${ETIQUETA_FASE[it.fase] ?? it.fase}</td>
      <td>${it.grupo_entrenamiento ?? "—"}</td>
      <td>${it.relacion}</td>
      <td>${it.tipo_contenido === "imagen" ? "🖼️ imagen" : it.muestra}</td>
      <td>${it.veces_presentado}</td>
      <td>${it.porcentaje_acierto != null ? it.porcentaje_acierto + "%" : "—"}</td>
    </tr>
  `;
}

async function mostrarDetalleParticipante(participanteId) {
  const modal = document.getElementById("modal-detalle");
  modal.className = "admin-modal";
  modal.innerHTML = `<div class="admin-modal-contenido"><p>Cargando detalle...</p></div>`;

  try {
    const { participante, ganancia, ensayos } = await api.obtenerDetalleParticipanteAdmin(
      participanteId
    );

    const filasEnsayos = ensayos
      .map(
        (e) => `
        <tr>
          <td>${ETIQUETA_FASE[e.fase] ?? e.fase}</td>
          <td>${e.posicion_en_secuencia}</td>
          <td>${e.items?.tipo_contenido === "imagen" ? "🖼️ imagen" : e.items?.muestra ?? "—"}</td>
          <td>${e.correcto === true ? "✅" : e.correcto === false ? "❌" : "—"}</td>
          <td>${e.tiempo_respuesta_ms != null ? (e.tiempo_respuesta_ms / 1000).toFixed(1) + "s" : "—"}</td>
        </tr>
      `
      )
      .join("");

    modal.innerHTML = `
      <div class="admin-modal-contenido">
        <button class="admin-modal-cerrar" id="btn-cerrar-modal">✕</button>
        <h2>${participante.codigoEncuestado}</h2>
        <p class="admin-subtexto">Grupo de entrenamiento: <strong>${participante.grupoEtiqueta}</strong></p>

        ${
          ganancia
            ? `
          <div class="admin-grupo-fila-mini" style="margin: 16px 0;">
            <span>Pre: <strong>${ganancia.porcentajePre ?? "—"}%</strong></span>
            <span>Entren.: <strong>${ganancia.porcentajeEntrenamiento ?? "—"}%</strong></span>
            <span>Post: <strong>${ganancia.porcentajePost ?? "—"}%</strong></span>
            <span>Ganancia: <strong>${ganancia.gananciaPrePost ?? "—"}</strong></span>
          </div>
        `
            : ""
        }

        <table class="admin-tabla">
          <thead>
            <tr><th>Fase</th><th>#</th><th>Muestra</th><th>Resultado</th><th>Tiempo</th></tr>
          </thead>
          <tbody>${filasEnsayos}</tbody>
        </table>
      </div>
    `;

    document.getElementById("btn-cerrar-modal").addEventListener("click", () => {
      modal.className = "admin-modal-oculto";
      modal.innerHTML = "";
    });
  } catch (err) {
    modal.innerHTML = `<div class="admin-modal-contenido"><p class="admin-error">${err.message}</p></div>`;
  }
}

cargarPanel();
