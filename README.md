# Estudio de igualación a la muestra

Sistema de pre-prueba, entrenamiento y post-prueba para un estudio de
igualación a la muestra, con panel de administrador y aleatorización de
ítems por participante.

## Estructura del proyecto

```
db/         esquema SQL de la base de datos + script de carga de items
backend/    API en Node/Express que habla con Supabase
frontend/   sitio estático (participante + panel admin), listo para GitHub Pages
scripts/    extracción del Excel original a JSON
```

## Antes de empezar: corrige las 2 filas pendientes

En `reporte_inconsistencias.md` (te lo compartí antes) quedaron 2 filas de la
hoja **Entrenamiento** (73 y 83) donde la respuesta no coincide exactamente
con ningún Eco. El sistema ya las carga usando el texto de la columna
Respuesta tal cual está, así que no es bloqueante, pero conviene revisarlas
en tu Excel y volver a correr la extracción si las corriges (ver paso 4).

---

## Paso 1 — Crear el proyecto en Supabase (base de datos, gratis)

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Crea un nuevo proyecto (elige una contraseña segura para la base, guárdala).
3. Una vez creado, ve a **SQL Editor** → **New query**.
4. Copia y pega todo el contenido de `db/schema.sql` y ejecútalo (botón "Run").
   Esto crea las tablas `items`, `participantes`, `sesiones_fase`, `ensayos`
   y las vistas de resumen.
5. Ve a **Project Settings → API**. Ahí vas a encontrar dos datos que necesitas
   para el siguiente paso:
   - **Project URL** (ej. `https://abcdefgh.supabase.co`)
   - **service_role key** (en la sección "Project API keys" — es la secreta,
     NO la "anon public". Nunca la pongas en el frontend, solo en el backend).

## Paso 2 — Cargar tus preguntas a la base de datos

Esto se hace una sola vez (o cada vez que actualices el Excel).

1. En tu computadora, instala la dependencia necesaria:
   ```bash
   pip install supabase --break-system-packages
   ```
2. Define las variables de entorno con los datos del Paso 1:
   ```bash
   export SUPABASE_URL="https://tu-proyecto.supabase.co"
   export SUPABASE_SERVICE_KEY="tu-service-role-key"
   ```
   En Windows (PowerShell):
   ```powershell
   $env:SUPABASE_URL="https://tu-proyecto.supabase.co"
   $env:SUPABASE_SERVICE_KEY="tu-service-role-key"
   ```
3. Corre el script de carga (ya viene `scripts/items_extraidos.json` generado
   a partir de tu Excel; si lo actualizas, ver el paso 4 primero):
   ```bash
   cd db
   python3 seed_items.py ../scripts/items_extraidos.json
   ```
4. Verifica en Supabase → **Table Editor → items** que aparecieron 118 filas
   (30 preprueba + 58 entrenamiento + 30 postprueba).

## Paso 3 — Desplegar el backend en Render (gratis)

1. Sube este proyecto completo a un repositorio de GitHub (puede ser privado).
2. Entra a [render.com](https://render.com) y crea una cuenta (puedes usar tu
   cuenta de GitHub para entrar directo).
3. **New → Web Service**, conecta tu repositorio de GitHub.
4. Configura:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. En la sección **Environment Variables**, agrega:
   - `SUPABASE_URL` = la misma URL del Paso 1
   - `SUPABASE_SERVICE_KEY` = la misma key del Paso 1
6. Click en **Create Web Service**. Espera a que termine el deploy (unos
   minutos). Al terminar, Render te da una URL pública, algo como:
   ```
   https://igualacion-muestra-backend.onrender.com
   ```
7. Prueba que funciona abriendo en el navegador:
   ```
   https://tu-backend.onrender.com/api/salud
   ```
   Debe responder `{"ok":true,...}`.

   **Nota sobre el plan gratuito de Render:** si nadie usa el servicio por
   15 minutos, "se duerme" y la primera petición después de eso tarda unos
   20-30 segundos en responder mientras despierta. Es normal, no es un error.

## Paso 4 — Publicar el frontend en GitHub Pages (gratis)

1. Antes de subir, edita `frontend/js/config.js` y cambia la URL:
   ```js
   export const API_URL = "https://tu-backend.onrender.com/api";
   ```
   (usa la URL real que te dio Render en el paso anterior, sin diagonal al final antes de `/api`)

2. Sube el proyecto (o al menos la carpeta `frontend`) a GitHub, si no lo
   habías hecho ya.
3. En tu repositorio de GitHub → **Settings → Pages**.
4. En **Source**, elige la rama (`main`) y la carpeta `/frontend` (o `/` si
   subiste solo el contenido de frontend a la raíz de otro repo).
5. Guarda. GitHub te da una URL pública, algo como:
   ```
   https://tu-usuario.github.io/tu-repo/
   ```
6. Los participantes usan esa URL directamente. Tú, como administrador,
   usas:
   ```
   https://tu-usuario.github.io/tu-repo/admin.html
   ```

   **Importante:** por ahora `admin.html` no tiene contraseña — cualquiera
   con el link puede ver las métricas de todos los participantes. Si vas a
   compartir la URL del estudio ampliamente, dime y te agrego una pantalla
   de acceso simple para el panel de administrador.

## Paso 5 (opcional) — Actualizar los items si corriges el Excel

Si corriges las filas pendientes o agregas las que faltan en Entrenamiento:

```bash
cd scripts
python3 extraer_items.py /ruta/a/tu/excel_actualizado.xlsx items_extraidos.json
cd ../db
python3 seed_items.py ../scripts/items_extraidos.json
```

Esto **agrega** filas nuevas (no borra las existentes). Si quieres reemplazar
todo desde cero, borra las filas de la tabla `items` en Supabase (Table
Editor → seleccionar todas → Delete) antes de volver a correr `seed_items.py`.

## Probar todo localmente antes de desplegar (opcional, recomendado)

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# edita .env con tus datos reales de Supabase
npm start
```

**Frontend**, en otra terminal:
```bash
cd frontend
python3 -m http.server 8080
```
Abre `http://localhost:8080/index.html` (participante) y
`http://localhost:8080/admin.html` (administrador). Asegúrate de que
`frontend/js/config.js` apunte a `http://localhost:3000/api` mientras
pruebas localmente.

## Cómo evita el sistema los problemas que mencionaste

- **Participantes repetidos:** el código de encuestado lo genera el
  servidor (`ENC-0001`, `ENC-0002`...), nunca lo escribe la persona. Además,
  la base de datos impide que la misma persona registre dos respuestas para
  el mismo ítem/fase (restricción `UNIQUE`).
- **Reanudar sin duplicar:** si alguien cierra el navegador a la mitad, al
  volver a abrir la página en el mismo dispositivo continúa donde se quedó
  (se guarda su código en `localStorage`). Si el estudio ya está
  `completado`, el código queda bloqueado y no puede reiniciar.
- **Orden al azar por participante:** tanto el orden de las preguntas como
  la posición de las 4 opciones se aleatorizan y se fijan una sola vez por
  participante (para que no cambien si recarga la página), evitando también
  que la respuesta correcta caiga siempre en el mismo lugar.
- **Respuestas correctas nunca expuestas:** el frontend nunca recibe cuál
  opción es la correcta; el backend valida todo y solo informa si acertó.
