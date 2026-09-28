/**
 * Maneja los datos que SÍ es correcto guardar en localStorage:
 * no son los datos del estudio (esos viven en la base de datos),
 * son solo una conveniencia para que este navegador recuerde
 * quién es el participante y pueda seguir donde se quedó.
 */

const CLAVE_TOKEN = "igualacion_token_dispositivo";
const CLAVE_PARTICIPANTE = "igualacion_participante_actual";

export function obtenerOCrearTokenDispositivo() {
  let token = localStorage.getItem(CLAVE_TOKEN);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(CLAVE_TOKEN, token);
  }
  return token;
}

export function guardarParticipanteActual(participante) {
  localStorage.setItem(CLAVE_PARTICIPANTE, JSON.stringify(participante));
}

export function obtenerParticipanteActual() {
  const crudo = localStorage.getItem(CLAVE_PARTICIPANTE);
  return crudo ? JSON.parse(crudo) : null;
}

export function limpiarParticipanteActual() {
  localStorage.removeItem(CLAVE_PARTICIPANTE);
}
