import * as api from "./api.js";
import { API_URL } from "./config.js";

const raiz = document.getElementById("admin-app");

const ETIQUETA_FASE = {
  preprueba: "Pre-prueba",
  entrenamiento: "Entrenamiento",
  postprueba: "Post-prueba",
};

async function cargarPanel() {
  try {
    const [{ participantes }, desglose] = await Promise.all([
      api.obtenerListaParticipantesAdmin(),
      api.obtenerDesgloseGeneralAdmin(),
    ]);
    renderPanel(participantes, desglose);
  } catch (err) {
    raiz.innerHTML = `<p class="admin-error">No se pudo cargar el panel: ${err.message}</p>`;
  }
}

function renderPanel(participantes, desglose) {
  raiz.innerHTML = `
    <header class="admin-encabezado">
      <h1>Panel de administrador</h1>
      <a class="admin-boton-secundario" href="${API_URL}/admin/exportar-csv" target="_blank">
        Exportar CSV
      </a>
    </header>

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
      <h2>Participantes (${participantes.length})</h2>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Código</th>
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

    <section class="admin-seccion">
      <h2>Ítems con más errores</h2>
      <table class="admin-tabla">
        <thead>
          <tr>
            <th>Fase</th>
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

function filaParticipante(p) {
  const pre = p.fases.preprueba?.porcentajeCorrecto;
  const ent = p.fases.entrenamiento?.porcentajeCorrecto;
  const post = p.fases.postprueba?.porcentajeCorrecto;
  const fecha = new Date(p.creadoEn).toLocaleDateString("es-MX");

  return `
    <tr>
      <td>${p.codigoEncuestado}</td>
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
      <td>${it.relacion}</td>
      <td>${it.muestra}</td>
      <td>${it.veces_presentado}</td>
      <td>${it.porcentaje_acierto != null ? it.porcentaje_acierto + "%" : "—"}</td>
    </tr>
  `;
}

cargarPanel();
