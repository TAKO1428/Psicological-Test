import * as api from "./api.js";
import { RUTA_IMAGENES, RUTA_MEMES, MEME_CORRECTO, MEME_INCORRECTO } from "./config.js";
import {
  obtenerOCrearTokenDispositivo,
  guardarParticipanteActual,
  obtenerParticipanteActual,
  limpiarParticipanteActual,
} from "./sesionLocal.js";

const raiz = document.getElementById("app");

const INFO_FASE = {
  preprueba: { nombre: "Pre-prueba", icono: "📝", clase: "preprueba" },
  entrenamiento: { nombre: "Entrenamiento", icono: "🎯", clase: "entrenamiento" },
  postprueba: { nombre: "Post-prueba", icono: "🏁", clase: "postprueba" },
};

const FLAG_COMPLETADA = {
  preprueba: "preprueba_completada",
  entrenamiento: "entrenamiento_completado",
  postprueba: "postprueba_completada",
};

const REQUISITO_PREVIO = {
  preprueba: null,
  entrenamiento: "preprueba",
  postprueba: "entrenamiento",
};

let estado = {
  participante: null,
  faseActual: null,
  itemActual: null,
  horaInicioRespuesta: null,
};

// ---------- Utilidades de render ----------

function render(html, { animar = true } = {}) {
  raiz.innerHTML = html;
  if (animar) {
    const tarjeta = raiz.querySelector(".tarjeta");
    if (tarjeta) tarjeta.classList.add("animar-entrada");
  }
}

function esRutaImagen(valor) {
  return typeof valor === "string" && /\.(jpg|jpeg|png|gif|webp)$/i.test(valor);
}

/** Renderiza un valor de contenido (texto normal o imagen) según corresponda. */
function contenidoHtml(valor, altTexto) {
  if (!valor) return "—";
  if (esRutaImagen(valor)) {
    return `<img src="${RUTA_IMAGENES}${valor}" alt="${altTexto}" loading="lazy" />`;
  }
  return valor;
}

function pantallaError(mensaje, opciones = {}) {
  render(`
    <div class="tarjeta">
      <h2>Ocurrió un problema</h2>
      <p class="texto-error">${mensaje}</p>
      ${opciones.botonReintentar ? `<button id="btn-reintentar">Reintentar</button>` : ""}
      ${opciones.botonMenu ? `<button id="btn-a-menu" class="boton-volver-menu">Volver al menú</button>` : ""}
    </div>
  `);
  if (opciones.botonReintentar) {
    document.getElementById("btn-reintentar").addEventListener("click", opciones.botonReintentar);
  }
  if (opciones.botonMenu) {
    document.getElementById("btn-a-menu").addEventListener("click", mostrarMenuPrincipal);
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
        una post-prueba. Podrás verlas en un menú y avanzar a tu ritmo.
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
      <button id="btn-continuar">Ir al menú</button>
    </div>
  `);
  document.getElementById("btn-continuar").addEventListener("click", mostrarMenuPrincipal);
}

// ---------- Menú principal ----------

async function mostrarMenuPrincipal() {
  render(`<div class="tarjeta"><p>Cargando tu progreso...</p></div>`);
  try {
    const { participante } = await api.obtenerParticipantePorCodigo(
      estado.participante.codigo_encuestado
    );
    estado.participante = participante;
    guardarParticipanteActual(participante);
    renderMenuPrincipal();
  } catch (err) {
    pantallaError(err.message, { botonReintentar: mostrarMenuPrincipal });
  }
}

function renderMenuPrincipal() {
  const p = estado.participante;

  const tarjetasHtml = ["preprueba", "entrenamiento", "postprueba"]
    .map((fase) => {
      const info = INFO_FASE[fase];
      const completada = p[FLAG_COMPLETADA[fase]];
      const requisito = REQUISITO_PREVIO[fase];
      const bloqueada = requisito ? !p[FLAG_COMPLETADA[requisito]] : false;

      let estadoIcono = "○";
      if (completada) estadoIcono = "✅";
      else if (bloqueada) estadoIcono = "🔒";

      let detalle = "Pendiente";
      if (completada) detalle = "Completada";
      else if (bloqueada) detalle = `Completa "${INFO_FASE[requisito].nombre}" primero`;
      else detalle = "Disponible";

      return `
        <button
          class="tarjeta-fase tarjeta-fase--${info.clase} ${bloqueada ? "tarjeta-fase--bloqueada" : ""}"
          data-fase="${fase}"
          ${bloqueada || completada ? "disabled" : ""}
        >
          <div class="tarjeta-fase__icono">${info.icono}</div>
          <div class="tarjeta-fase__texto">
            <p class="tarjeta-fase__titulo">${info.nombre}</p>
            <p class="tarjeta-fase__detalle">${detalle}</p>
          </div>
          <div class="tarjeta-fase__estado">${estadoIcono}</div>
        </button>
      `;
    })
    .join("");

  const todoCompletado = p.preprueba_completada && p.entrenamiento_completado && p.postprueba_completada;

  render(`
    <div class="tarjeta">
      <div class="menu-encabezado">
        <h1>Menú del estudio</h1>
      </div>
      <p class="menu-subtitulo" style="text-align:center;">
        <span class="menu-codigo">${p.codigo_encuestado}</span>
      </p>
      <div class="tarjetas-fase">
        ${tarjetasHtml}
      </div>
      ${todoCompletado ? `<p style="text-align:center; margin-top:20px;">🎉 Completaste el estudio. ¡Gracias por participar!</p>` : ""}
    </div>
  `);

  document.querySelectorAll(".tarjeta-fase:not(.tarjeta-fase--bloqueada):not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => iniciarFase(btn.dataset.fase));
  });
}

// ---------- Flujo de fase ----------

async function iniciarFase(fase) {
  estado.faseActual = fase;
  render(`<div class="tarjeta"><p>Preparando ${INFO_FASE[fase].nombre}...</p></div>`);
  try {
    await api.iniciarFase(fase, estado.participante.id);
    cargarSiguienteItem();
  } catch (err) {
    pantallaError(err.message, { botonMenu: true });
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

    pantallaEjemplo();
  } catch (err) {
    pantallaError(err.message, { botonReintentar: cargarSiguienteItem, botonMenu: true });
  }
}

function barraProgresoHtml() {
  const pct = Math.round((estado.posicionEnSecuencia / estado.totalEnFase) * 100);
  return `
    <p class="etiqueta-progreso">
      <span>${INFO_FASE[estado.faseActual].nombre}</span>
      <span>${estado.posicionEnSecuencia} / ${estado.totalEnFase}</span>
    </p>
    <div class="barra-progreso">
      <div class="barra-progreso__relleno" style="width:${pct}%"></div>
    </div>
  `;
}

function pantallaEjemplo() {
  const item = estado.itemActual;
  render(`
    <div class="tarjeta">
      ${barraProgresoHtml()}
      <p class="etiqueta-ejemplo">Ejemplo de la relación "${item.relacion}"</p>
      <div class="par-ejemplo">
        <span class="chip">${contenidoHtml(item.ejemploSelector1, "ejemplo 1")}</span>
        <span class="conector">↔</span>
        <span class="chip">${contenidoHtml(item.ejemploSelector2, "ejemplo 2")}</span>
      </div>
      <button id="btn-siguiente">Siguiente</button>
    </div>
  `);
  document.getElementById("btn-siguiente").addEventListener("click", pantallaPregunta);
}

function pantallaPregunta() {
  const item = estado.itemActual;
  estado.horaInicioRespuesta = performance.now();

  // la muestra puede ser imagen o texto de forma independiente a los ecos
  // (ítems "mixtos", ej. muestra="vida" en texto con ecos en fotografía)
  const muestraHtml =
    item.tipoContenidoMuestra === "imagen"
      ? contenidoHtml(item.muestra, "muestra")
      : `<span>${item.muestra}</span>`;

  const opcionesHtml = item.ecos
    .map(
      (eco, idx) => `
      <button class="opcion-eco" data-indice="${idx}">${contenidoHtml(eco, "opción " + (idx + 1))}</button>
    `
    )
    .join("");

  render(`
    <div class="tarjeta">
      ${barraProgresoHtml()}
      <p class="etiqueta-muestra">Muestra</p>
      <div class="texto-muestra">${muestraHtml}</div>
      <div class="grid-opciones">
        ${opcionesHtml}
      </div>
    </div>
  `);

  document.querySelectorAll(".opcion-eco").forEach((btn) => {
    btn.addEventListener("click", () => enviarRespuesta(Number(btn.dataset.indice), btn));
  });
}

async function enviarRespuesta(indiceRespondido, botonElegido) {
  const tiempoRespuestaMs = Math.round(performance.now() - estado.horaInicioRespuesta);
  const esEntrenamiento = estado.faseActual === "entrenamiento";

  document.querySelectorAll(".opcion-eco").forEach((b) => (b.disabled = true));

  try {
    const resultado = await api.responderItem(estado.faseActual, {
      participanteId: estado.participante.id,
      itemId: estado.itemActual.id,
      indiceRespondido,
      tiempoRespuestaMs,
    });

    if (esEntrenamiento) {
      // en Entrenamiento sí se revela si fue correcto: color en el botón + meme flotante
      botonElegido.classList.add(resultado.correcto ? "correcta" : "incorrecta");
      mostrarMemeFeedback(resultado.correcto);
    } else {
      // en Pre-prueba y Post-prueba NO se revela si fue correcto o no:
      // solo una confirmación neutra de que la respuesta quedó registrada
      botonElegido.classList.add("respondida-neutro");
      mostrarConfirmacionNeutra();
    }

    setTimeout(cargarSiguienteItem, esEntrenamiento ? 900 : 500);
  } catch (err) {
    pantallaError(err.message, {
      botonReintentar: () => enviarRespuesta(indiceRespondido, botonElegido),
      botonMenu: true,
    });
  }
}

/**
 * Muestra un meme al centro de la pantalla (aparición súbita + fade out),
 * SOLO usado en Entrenamiento, donde sí tiene sentido celebrar/corregir
 * en el momento porque es la fase de aprendizaje.
 */
function mostrarMemeFeedback(esCorrecto) {
  const archivo = esCorrecto ? MEME_CORRECTO : MEME_INCORRECTO;
  const overlay = document.createElement("div");
  overlay.className = "overlay-meme";
  overlay.innerHTML = `<img src="${RUTA_MEMES}${archivo}" alt="${esCorrecto ? "¡Correcto!" : "Incorrecto"}" />`;
  document.body.appendChild(overlay);

  // el fade out lo dispara la clase; se remueve del DOM cuando termina la animación
  overlay.addEventListener("animationend", () => overlay.remove());
}

/**
 * Confirmación neutra para Pre-prueba y Post-prueba: no revela si la
 * respuesta fue correcta, solo confirma que quedó registrada, para no
 * introducir aprendizaje/sesgo durante las fases de medición.
 */
function mostrarConfirmacionNeutra() {
  const overlay = document.createElement("div");
  overlay.className = "overlay-neutro";
  overlay.innerHTML = `<div class="overlay-neutro__marca">✓</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("animationend", () => overlay.remove());
}

function manejarFinDeFase() {
  render(`
    <div class="tarjeta">
      <h2>${INFO_FASE[estado.faseActual].nombre} completada</h2>
      <p>Buen trabajo. Puedes continuar con la siguiente parte disponible desde el menú.</p>
      <button id="btn-al-menu">Volver al menú</button>
    </div>
  `);
  document.getElementById("btn-al-menu").addEventListener("click", mostrarMenuPrincipal);
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
    guardarParticipanteActual(participante);
    renderMenuPrincipal();
  } catch (err) {
    limpiarParticipanteActual();
    pantallaConsentimiento();
  }
}

arrancar();
