import * as api from "./api.js";
import {
  obtenerOCrearTokenDispositivo,
  guardarParticipanteActual,
  obtenerParticipanteActual,
  limpiarParticipanteActual,
} from "./sesionLocal.js";

const raiz = document.getElementById("app");

const NOMBRE_FASE = {
  preprueba: "Pre-prueba",
  entrenamiento: "Entrenamiento",
  postprueba: "Post-prueba",
};

let estado = {
  participante: null,
  faseActual: null,
  itemActual: null,
  mostrandoEjemplo: true,
  horaInicioRespuesta: null,
};

// ---------- Utilidades de render ----------

function render(html) {
  raiz.innerHTML = html;
}

function pantallaError(mensaje, opciones = {}) {
  render(`
    <div class="tarjeta">
      <h2>Ocurrió un problema</h2>
      <p class="texto-error">${mensaje}</p>
      ${opciones.botonReintentar ? `<button id="btn-reintentar">Reintentar</button>` : ""}
    </div>
  `);
  if (opciones.botonReintentar) {
    document.getElementById("btn-reintentar").addEventListener("click", opciones.botonReintentar);
  }
}

// ---------- Pantalla: Bienvenida / Consentimiento ----------

function pantallaConsentimiento() {
  render(`
    <div class="tarjeta">
      <h1>Estudio de igualación a la muestra</h1>
      <p>
        Antes de comenzar, es necesario que aceptes participar de forma
        voluntaria en este estudio. Tus respuestas se registran de forma
        anónima bajo un número de encuestado, no con tu nombre.
      </p>
      <p>
        El estudio consta de tres partes: una pre-prueba, un entrenamiento y
        una post-prueba. Puedes tomarte el tiempo que necesites en cada
        pregunta.
      </p>
      <label class="fila-checkbox">
        <input type="checkbox" id="chk-consentimiento" />
        Acepto participar voluntariamente en este estudio.
      </label>
      <button id="btn-comenzar" disabled>Comenzar</button>
    </div>
  `);

  const chk = document.getElementById("chk-consentimiento");
  const btn = document.getElementById("btn-comenzar");
  chk.addEventListener("change", () => {
    btn.disabled = !chk.checked;
  });
  btn.addEventListener("click", registrarNuevoParticipante);
}

async function registrarNuevoParticipante() {
  render(`<div class="tarjeta"><p>Registrando...</p></div>`);
  try {
    const token = obtenerOCrearTokenDispositivo();
    const { participante } = await api.crearParticipante(token);
    estado.participante = participante;
    guardarParticipanteActual(participante);
    mostrarCodigoAsignado();
  } catch (err) {
    pantallaError(err.message, { botonReintentar: registrarNuevoParticipante });
  }
}

function mostrarCodigoAsignado() {
  render(`
    <div class="tarjeta">
      <h2>Tu número de encuestado es:</h2>
      <p class="codigo-grande">${estado.participante.codigo_encuestado}</p>
      <p>Anótalo por si necesitas retomar el estudio más adelante.</p>
      <button id="btn-continuar">Continuar</button>
    </div>
  `);
  document
    .getElementById("btn-continuar")
    .addEventListener("click", () => iniciarFase("preprueba"));
}

// ---------- Flujo de fase ----------

async function iniciarFase(fase) {
  estado.faseActual = fase;
  render(`<div class="tarjeta"><p>Preparando ${NOMBRE_FASE[fase]}...</p></div>`);
  try {
    await api.iniciarFase(fase, estado.participante.id);
    cargarSiguienteItem();
  } catch (err) {
    pantallaError(err.message, { botonReintentar: () => iniciarFase(fase) });
  }
}

async function cargarSiguienteItem() {
  try {
    const datos = await api.obtenerSiguienteItem(estado.faseActual, estado.participante.id);

    if (datos.terminada) {
      return manejarFinDeFase();
    }

    estado.itemActual = datos.item;
    estado.posicionEnSecuencia = datos.posicionEnSecuencia;
    estado.totalEnFase = datos.totalEnFase;
    estado.mostrandoEjemplo = true;

    pantallaEjemplo();
  } catch (err) {
    pantallaError(err.message, { botonReintentar: cargarSiguienteItem });
  }
}

function pantallaEjemplo() {
  const item = estado.itemActual;
  render(`
    <div class="tarjeta">
      <p class="etiqueta-progreso">
        ${NOMBRE_FASE[estado.faseActual]} — pregunta ${estado.posicionEnSecuencia} de ${estado.totalEnFase}
      </p>
      <div class="par-ejemplo">
        <span class="chip">${item.ejemploSelector1 ?? "—"}</span>
        <span class="conector">↔</span>
        <span class="chip">${item.ejemploSelector2 ?? "—"}</span>
      </div>
      <button id="btn-siguiente">Siguiente</button>
    </div>
  `);
  document.getElementById("btn-siguiente").addEventListener("click", pantallaPregunta);
}

function pantallaPregunta() {
  const item = estado.itemActual;
  estado.horaInicioRespuesta = performance.now();

  const opcionesHtml = item.ecos
    .map(
      (eco, idx) => `
      <button class="opcion-eco" data-indice="${idx}">${eco}</button>
    `
    )
    .join("");

  render(`
    <div class="tarjeta">
      <p class="etiqueta-progreso">
        ${NOMBRE_FASE[estado.faseActual]} — pregunta ${estado.posicionEnSecuencia} de ${estado.totalEnFase}
      </p>
      <p class="texto-muestra">${item.muestra}</p>
      <div class="grid-opciones">
        ${opcionesHtml}
      </div>
    </div>
  `);

  document.querySelectorAll(".opcion-eco").forEach((btn) => {
    btn.addEventListener("click", () => enviarRespuesta(Number(btn.dataset.indice)));
  });
}

async function enviarRespuesta(indiceRespondido) {
  const tiempoRespuestaMs = Math.round(performance.now() - estado.horaInicioRespuesta);

  // deshabilitar botones para evitar doble clic mientras se envía
  document.querySelectorAll(".opcion-eco").forEach((b) => (b.disabled = true));

  try {
    await api.responderItem(estado.faseActual, {
      participanteId: estado.participante.id,
      itemId: estado.itemActual.id,
      indiceRespondido,
      tiempoRespuestaMs,
    });
    cargarSiguienteItem();
  } catch (err) {
    pantallaError(err.message, {
      botonReintentar: () => enviarRespuesta(indiceRespondido),
    });
  }
}

function manejarFinDeFase() {
  const siguiente = { preprueba: "entrenamiento", entrenamiento: "postprueba", postprueba: null };
  const siguienteFase = siguiente[estado.faseActual];

  if (siguienteFase) {
    render(`
      <div class="tarjeta">
        <h2>${NOMBRE_FASE[estado.faseActual]} completada</h2>
        <p>A continuación comenzarás: ${NOMBRE_FASE[siguienteFase]}.</p>
        <button id="btn-siguiente-fase">Continuar</button>
      </div>
    `);
    document
      .getElementById("btn-siguiente-fase")
      .addEventListener("click", () => iniciarFase(siguienteFase));
  } else {
    limpiarParticipanteActual();
    render(`
      <div class="tarjeta">
        <h2>Estudio finalizado</h2>
        <p>Gracias por tu participación. Puedes cerrar esta ventana.</p>
      </div>
    `);
  }
}

// ---------- Arranque: ¿hay una sesión guardada para reanudar? ----------

async function arrancar() {
  const guardado = obtenerParticipanteActual();
  if (!guardado) {
    return pantallaConsentimiento();
  }

  render(`<div class="tarjeta"><p>Recuperando tu sesión...</p></div>`);
  try {
    const { participante } = await api.obtenerParticipantePorCodigo(guardado.codigo_encuestado);
    estado.participante = participante;

    if (participante.estado === "completado") {
      limpiarParticipanteActual();
      render(`
        <div class="tarjeta">
          <h2>Este código ya completó el estudio</h2>
          <p>No es posible volver a responder con el mismo número de encuestado.</p>
        </div>
      `);
      return;
    }

    const fase = participante.fase_actual;
    if (fase && fase !== "finalizado") {
      iniciarFase(fase);
    } else {
      pantallaConsentimiento();
    }
  } catch (err) {
    limpiarParticipanteActual();
    pantallaConsentimiento();
  }
}

arrancar();
