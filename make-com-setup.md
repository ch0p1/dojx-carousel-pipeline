# Configuración de Make.com — paso a paso

Antes de empezar, armá la hoja de Google Sheets "DOJX Content" con estas columnas
exactas (el orden no importa, los nombres sí porque los vas a referenciar en Make):

| Columna | Contenido | Ejemplo |
|---|---|---|
| `row_id` | Identificador único de la fila (podés usar la fórmula `=ROW()` o un UUID pegado a mano) | `1` |
| `tema` | El tema puntual que le pasás a Claude | `por qué perder por sumisión no es una derrota` |
| `pillar` | Uno de los 4 pilares, para filtrar/reportar | `MENTALIDAD` |
| `status` | Estado del flujo | `pendiente` / `generando` / `en revisión` / `publicado` / `rechazado` |
| `image_urls` | URLs separadas por coma, las llena el callback de GitHub | (vacío hasta generarse) |
| `caption` | El caption que devuelve Claude | (vacío hasta generarse) |
| `telegram_message_id` | Para poder editar el mensaje después de aprobar/rechazar | (vacío hasta enviarse) |
| `fecha_publicado` | Se llena al publicar | (vacío) |

Cargá 15-20 filas con temas y `status = pendiente` antes de prender el escenario A.
Esa hoja es tu backlog editorial.

---

## Escenario A — Generación

**Trigger: Schedule**
- Módulo: *Schedule* → Every day at fixed times: 09:00, 13:00, 17:00 (hora Colombia)
  o el volumen que quieras probar primero (arrancá con 1x al día).

**Módulo 2: Google Sheets → Search Rows**
- Spreadsheet: DOJX Content / Sheet: Temas
- Filter: `status` = `pendiente`
- Max results: 1
- Esto te da la fila de trabajo de esta corrida.

**Módulo 3: HTTP → Make a request** (llamada a Claude API)
- URL: `https://api.anthropic.com/v1/messages`
- Method: POST
- Headers:
  - `x-api-key`: tu API key (guardala como variable/conexión, no hardcodeada)
  - `anthropic-version`: `2023-06-01`
  - `content-type`: `application/json`
- Body type: Raw / JSON
```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 2000,
  "system": "PEGAR ACÁ TODO EL CONTENIDO DE prompts/system-prompt-claude.md",
  "messages": [
    { "role": "user", "content": "{{2.tema}}" }
  ]
}
```
- `claude-haiku-4-5-20251001` es el modelo más barato disponible — de sobra para
  este tipo de generación de texto estructurado. Verificá el nombre exacto vigente
  en la documentación de Anthropic antes de lanzar a producción, los identificadores
  de modelo cambian con el tiempo.

**Módulo 4: JSON → Parse JSON**
- Data structure: definila a mano o dejá que Make la infiera pegando un ejemplo
  de respuesta.
- Input: `{{3.data.content[].text}}` (el texto que devuelve Claude, que es el JSON
  del carrusel)

**Módulo 5: reemplazar el placeholder de imágenes**
Esto es el paso menos "arrastrar y soltar" de todo el escenario. Opciones de más
a menos simple:

- **Simple (recomendado para arrancar):** en el `system-prompt-claude.md` cambiá
  la instrucción de `"image"` a que Claude SIEMPRE use `"solid"` con colores de tu
  paleta (negro `#111111`, rojo `#C41E1E`, blanco `#FFFFFF`). Te quedás sin fondos
  de foto por ahora, pero el pipeline corre 100% automático desde el día uno. Migrás
  a fondos con foto cuando el resto del sistema ya esté probado.
- **Completo:** agregá un módulo *HTTP → Make a request* a la Admin API de
  Cloudinary (`GET https://api.cloudinary.com/v1_1/{cloud_name}/resources/image?prefix=backgrounds/{pilar}&type=upload`),
  después un *Array Aggregator*, y un *Tools → Set variable* con la función
  `get(shuffle(array); 1)` para elegir una al azar. Reemplazás el placeholder en
  el JSON de Claude con esa URL antes del siguiente módulo.

**Módulo 6: HTTP → Make a request** (dispara GitHub Actions)
- URL: `https://api.github.com/repos/ch0p1/dojx-carousel-pipeline/dispatches`
- Method: POST
- Headers:
  - `Authorization`: `Bearer {{tu GitHub token}}`
  - `Accept`: `application/vnd.github+json`
- Body:
```json
{
  "event_type": "generate-carousel",
  "client_payload": {
    "row_id": "{{2.row_id}}",
    "pillar_label": "{{4.pillar_label}}",
    "accent_color": "{{4.accent_color}}",
    "caption": "{{4.caption}}",
    "slides": {{4.slides}}
  }
}
```

**Módulo 7: Google Sheets → Update a Row**
- Row: la misma de la Search Rows (Módulo 2)
- `status` = `generando`
- `caption` = `{{4.caption}}`

---

## Escenario B — Callback + revisión

**Trigger: Webhooks → Custom webhook**
- Creá el webhook, Make te da una URL. Esa URL va en el secret
  `MAKE_CALLBACK_WEBHOOK` del repo de GitHub.
- El payload que llega es el que arma el último step del Action:
  `{ "row_id": "...", "image_urls": ["url1", "url2", ...] }`

**Módulo 2: Google Sheets → Update a Row**
- Row: buscá por `row_id` (necesitás un *Search Rows* antes si Update a Row no
  soporta filtro directo en tu versión de Make — normalmente hace falta un Search
  Rows → Update a Row encadenados)
- `image_urls` = `{{join(1.image_urls; ", ")}}`
- `status` = `en revisión`

**Módulo 3: Telegram Bot → Send an Album** (o Send Photo repetido si tu plan no
tiene Send Album)
- Chat ID: tu chat ID personal (te lo da @userinfobot en Telegram)
- Photos: iterá `{{1.image_urls}}`

**Módulo 4: Telegram Bot → Send a Message**
- Text: el caption + tema, para que sepas qué estás aprobando
- Inline keyboard:
  - Botón 1: texto `✅ Aprobar`, callback_data `approve_{{1.row_id}}`
  - Botón 2: texto `✏️ Rechazar`, callback_data `reject_{{1.row_id}}`

**Módulo 5: Google Sheets → Update a Row**
- `telegram_message_id` = `{{4.message_id}}` (para poder editar el mensaje después
  y sacar los botones una vez que ya se decidió)

---

## Escenario C — Publicación

**Trigger: Telegram Bot → Watch Updates**
- Filter: solo procesar si `callback_query` existe (es un click de botón, no un
  mensaje de texto normal)

**Módulo 2: Tools → Set variable**
- Extraé `action` (approve/reject) y `row_id` parseando
  `{{1.callback_query.data}}` con un split por `_`

**Módulo 3: Router**
- **Ruta "Aprobar"** (filtro: `action` = `approve`):
  1. Google Sheets → Search Rows (por `row_id`) → traé `image_urls` y `caption`
  2. HTTP → POST a `https://graph.facebook.com/v21.0/{{ig_user_id}}/media` por
     cada imagen con `image_url` + `is_carousel_item=true` → guardá los
     `creation_id` de cada respuesta (esto ya lo tenías armado de tu pipeline
     anterior, reusalo tal cual)
  3. HTTP → POST a `.../media` con `media_type=CAROUSEL`,
     `children=[creation_id_1, creation_id_2, ...]`, `caption`
  4. HTTP → POST a `.../media_publish` con el `creation_id` del paso 3
  5. Google Sheets → Update Row: `status = publicado`, `fecha_publicado = now`
  6. Telegram → Edit Message (sacar los botones, poner "✅ Publicado")

- **Ruta "Rechazar"** (filtro: `action` = `reject`):
  1. Google Sheets → Update Row: `status = rechazado`
  2. Telegram → Edit Message ("❌ Rechazado — corregí el tema en la hoja y
     poné status = pendiente para regenerar")

---

## Orden de armado recomendado

No armes los tres escenarios de una. Orden sugerido para no perderte debuggeando
tres cosas a la vez:

1. Escenario A completo, pero el módulo 6 (GitHub dispatch) apuntalo primero a un
   webhook de prueba (webhook.site) en vez de GitHub real, para confirmar que el
   JSON de Claude sale bien formado.
2. Una vez que el JSON se ve bien, conectá el módulo 6 a GitHub de verdad y
   confirmá en la pestaña Actions de tu repo que el workflow corre y genera PNGs.
3. Recién ahí armás el Escenario B (necesitás que el Action le pegue al webhook
   de Make, así que primero tiene que andar el Action).
4. Escenario C al final, porque depende de que ya tengas mensajes de Telegram
   circulando con los botones.

Probá cada escenario con 1 fila de la hoja antes de cargar las 15-20 completas.
