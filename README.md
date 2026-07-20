# Pipeline de carruseles automáticos — DOJX

Sistema: hoja de temas → texto generado por Claude → imagen renderizada →
revisión humana en Telegram → publicación automática en Instagram.

## 1. Subir este repo a GitHub

```
cd dojx-carousel-pipeline
git init
git add .
git commit -m "pipeline inicial"
git remote add origin https://github.com/TU_USUARIO/dojx-carousel-pipeline.git
git push -u origin main
```

## 2. Configurar secrets del repo (Settings → Secrets and variables → Actions)

- `CLOUDINARY_CLOUD_NAME` — tu cloud name de Cloudinary
- `CLOUDINARY_UPLOAD_PRESET` — creá un upload preset "unsigned" en Cloudinary
  (Settings → Upload → Add upload preset → Signing Mode: Unsigned)
- `MAKE_CALLBACK_WEBHOOK` — la URL del webhook de Make.com que recibe las
  URLs finales (lo creás en el paso 4)

## 3. Generar un GitHub Token para que Make dispare el workflow

Settings de tu cuenta de GitHub → Developer settings → Personal access tokens
→ Fine-grained token, con permiso "Contents: Read and write" y
"Actions: Read and write" sobre este repo. Lo vas a usar en Make.

## 4. Armar el escenario en Make.com (gratis, free tier alcanza)

**Escenario A — Generación:**
1. Trigger: Google Sheets → Watch Rows (status = "pendiente")
2. HTTP → POST a la API de Claude, con el system prompt de
   `prompts/system-prompt-claude.md` y el tema de la fila como user message.
   Parsear la respuesta JSON.
3. HTTP → POST a `https://api.github.com/repos/TU_USUARIO/TU_REPO/dispatches`
   con `event_type: generate-carousel` y el JSON de Claude como
   `client_payload` (agregando `row_id` de la fila de Sheets).
4. Google Sheets → Update row, status = "generando"

**Escenario B — Callback + revisión (trigger: Webhook, la URL que pusiste
en `MAKE_CALLBACK_WEBHOOK`):**
1. Recibe `row_id` + `image_urls` desde GitHub Actions.
2. Google Sheets → Update row con las URLs, status = "en revisión"
3. Telegram Bot → Send Media Group (las imágenes) + Send Message con
   caption y dos botones inline: "✅ Aprobar" / "✏️ Rechazar"

**Escenario C — Publicación (trigger: Telegram Bot → Watch Updates,
filtrando por el callback del botón):**
1. Si "Aprobar" → Meta Graph API: crear carousel container + publicar
   (esto ya lo tenés armado de tu pipeline anterior)
2. Google Sheets → Update row, status = "publicado"
3. Si "Rechazar" → status = "rechazado", opcional: pedirte una nota de
   corrección y volver a llamar a Claude con esa nota como contexto extra.

## 5. Banco de imágenes de fondo (curación única, no automática)

El sistema NO genera fotos ni arte por IA en tiempo real — eso rompería la consistencia
visual y costaría dinero en cada corrida. En cambio:

1. Subí a Cloudinary un set de 8-15 imágenes por pilar que ya tengas o generes una
   sola vez (Kling, stock, tus propias fotos de Fight House Granada), organizadas en
   carpetas: `backgrounds/disciplina/`, `backgrounds/kickboxing/`,
   `backgrounds/depresion/`, `backgrounds/comunidad/`.
2. En Make.com, agregá un módulo entre "Claude API" y "GitHub dispatch" que:
   - Busque en el JSON de Claude cualquier slide con `background.value` igual a
     `"PLACEHOLDER_BANCO_IMAGENES"`
   - Llame a la API de Cloudinary (`resources/image/upload` con `prefix` = la carpeta
     del pilar) para listar las imágenes disponibles
   - Elija una al azar (módulo "Array Aggregator" + función `shuffle()` en Make, o un
     paso de Node si preferís control fino)
   - Reemplace el placeholder por la URL real antes de disparar el GitHub Action
3. Repetir imágenes es aceptable — mejor una rotación de 10 fotos sólidas que buscar
   una nueva cada vez.

## 6. Bot de Telegram (5 minutos)

Hablale a @BotFather en Telegram → `/newbot` → te da un token → lo usás
en el módulo de Telegram de Make.

## Notas

- El workflow de GitHub Actions ya viene con logs (`console.log`) para
  debuggear si un render falla.
- El extraction de `secure_url` en el step de Cloudinary con `grep`/`sed`
  es básico — si tenés muchos slides o nombres de archivo raros, cambialo
  por un script de Node con `curl` + `JSON.parse` en vez de regex bash.
- Empezá con 1 carrusel al día, no con 3. Ajustá el prompt viendo qué tan
  cerca queda de tu voz real antes de escalar el volumen.
