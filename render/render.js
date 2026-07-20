/**
 * render.js
 * Genera los PNG de un carrusel a partir de un JSON con slides.
 *
 * Uso: node render.js data.json
 *
 * Formato esperado (lo que devuelve Claude API):
 * {
 *   "pillar_label": "LA DISCIPLINA, TU ALIADO",
 *   "accent_color": "#C41E1E",
 *   "slides": [
 *     {
 *       "type": "content",
 *       "title": "Todos quisieramos tener <span class='accent'>TALENTO</span>",
 *       "title_case": "none",
 *       "body": "",
 *       "footer": "Pero el talento no se levanta temprano...",
 *       "footer_align": "center",
 *       "background": { "type": "solid", "value": "#111111" }
 *       // o: "background": { "type": "image", "value": "https://res.cloudinary.com/.../foto.jpg" }
 *     },
 *     {
 *       "type": "cta",
 *       "bg_color": "#C41E1E",
 *       "headline": "Las artes marciales cambian vidas",
 *       "subline": "¿Qué esperas para cambiar la tuya?",
 *       "follow_text": "Síguenos para seguir aprendiendo"
 *     }
 *   ]
 * }
 *
 * Nota: el campo "title"/"footer" puede incluir <span class="accent">...</span>
 * para resaltar palabras — Claude debe generarlo así cuando el guion lo pida.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function fillTemplate(template, replacements) {
  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  return out;
}

async function main() {
  const dataPath = process.argv[2] || 'data.json';
  if (!fs.existsSync(dataPath)) {
    console.error(`No se encontró el archivo: ${dataPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const contentTemplate = fs.readFileSync(path.join(__dirname, 'template-content.html'), 'utf-8');
  const ctaTemplate = fs.readFileSync(path.join(__dirname, 'template-cta.html'), 'utf-8');

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  const generatedFiles = [];
  const accentColor = data.accent_color || '#C41E1E';

  for (let i = 0; i < data.slides.length; i++) {
    const slide = data.slides[i];
    let html;

    if (slide.type === 'cta') {
      html = fillTemplate(ctaTemplate, {
        BG_COLOR: slide.bg_color || accentColor,
        PILLAR_LABEL: data.pillar_label || '',
        HEADLINE: slide.headline || '',
        SUBLINE: slide.subline || '',
        FOLLOW_TEXT: slide.follow_text || 'Síguenos para seguir aprendiendo',
      });
    } else {
      const bg = slide.background || { type: 'solid', value: '#111111' };
      const isPhoto = bg.type === 'image';
      const bgStyle = isPhoto
        ? `background: url('${bg.value}') center/cover no-repeat;`
        : `background: ${bg.value};`;

      html = fillTemplate(contentTemplate, {
        BG_STYLE: bgStyle,
        BODY_CLASS: isPhoto ? 'has-photo' : '',
        PILLAR_LABEL: data.pillar_label || '',
        TITLE: slide.title || '',
        TITLE_CASE: slide.title_case || 'none',
        BODY: slide.body || '',
        FOOTER: slide.footer || '',
        FOOTER_ALIGN: slide.footer_align || 'left',
        ACCENT_COLOR: accentColor,
        LOGO_COLOR: isPhoto ? '#FFFFFF' : (bg.value === '#FFFFFF' ? '#000000' : '#FFFFFF'),
      });
    }

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluateHandle('document.fonts.ready');

    const fileName = `slide-${String(i + 1).padStart(2, '0')}.png`;
    const filePath = path.join(outputDir, fileName);
    await page.screenshot({ path: filePath });
    generatedFiles.push(filePath);
    console.log(`Generado: ${filePath}`);
  }

  await browser.close();

  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({ files: generatedFiles.map((f) => path.basename(f)) }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
