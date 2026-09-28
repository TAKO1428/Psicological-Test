// URL de tu backend ya desplegado en Render.
// Si lo vuelves a desplegar con otro nombre, actualiza esta línea.
export const API_URL = "https://psicological-test.onrender.com/api";

// Carpeta donde viven las imágenes del entrenamiento con fotografías,
// servidas como archivos estáticos junto con el resto del frontend
// (no requieren backend ni Supabase Storage).
export const RUTA_IMAGENES = "./assets/entrenamiento-imagenes/";

// Memes de feedback mostrados SOLO durante Entrenamiento al responder.
// Sube tus propios archivos con estos nombres exactos para reemplazarlos.
export const RUTA_MEMES = "./assets/memes/";
export const MEME_CORRECTO = "correcto.png";
export const MEME_INCORRECTO = "incorrecto.png";
