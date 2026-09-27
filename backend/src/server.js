import express from "express";
import cors from "cors";
import "dotenv/config";

import { router as participantesRouter } from "./rutas/participantes.js";
import { router as fasesRouter } from "./rutas/fases.js";
import { router as adminRouter } from "./rutas/admin.js";

const app = express();

// CORS: en producción, restringe a tu dominio de GitHub Pages en vez de "*"
app.use(cors());
app.use(express.json());

app.get("/api/salud", (req, res) => {
  res.json({ ok: true, mensaje: "API de igualación a la muestra activa" });
});

app.use("/api/participantes", participantesRouter);
app.use("/api/fases", fasesRouter);
app.use("/api/admin", adminRouter);

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`Servidor escuchando en puerto ${PUERTO}`);
});
