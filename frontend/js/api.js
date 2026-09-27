import { API_URL } from "./config.js";

async function manejarRespuesta(res) {
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(datos.error || "Error de conexión con el servidor.");
    error.status = res.status;
    error.datos = datos;
    throw error;
  }
  return datos;
}

export async function crearParticipante(tokenDispositivo) {
  const res = await fetch(`${API_URL}/participantes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consentimientoAceptado: true, tokenDispositivo }),
  });
  return manejarRespuesta(res);
}

export async function obtenerParticipantePorCodigo(codigo) {
  const res = await fetch(`${API_URL}/participantes/${encodeURIComponent(codigo)}`);
  return manejarRespuesta(res);
}

export async function iniciarFase(fase, participanteId) {
  const res = await fetch(`${API_URL}/fases/${fase}/iniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participanteId }),
  });
  return manejarRespuesta(res);
}

export async function obtenerSiguienteItem(fase, participanteId) {
  const res = await fetch(
    `${API_URL}/fases/${fase}/siguiente-item?participanteId=${participanteId}`
  );
  return manejarRespuesta(res);
}

export async function responderItem(fase, payload) {
  const res = await fetch(`${API_URL}/fases/${fase}/responder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return manejarRespuesta(res);
}

export async function obtenerListaParticipantesAdmin() {
  const res = await fetch(`${API_URL}/admin/participantes`);
  return manejarRespuesta(res);
}

export async function obtenerDesgloseGeneralAdmin() {
  const res = await fetch(`${API_URL}/admin/desglose-general`);
  return manejarRespuesta(res);
}

export async function obtenerDetalleParticipanteAdmin(id) {
  const res = await fetch(`${API_URL}/admin/participantes/${id}/detalle`);
  return manejarRespuesta(res);
}
