/**
 * render.js
 * Recibe un JSON con la estructura de un carrusel y genera un PNG por slide.
 *
 * Uso: node render.js data.json
 *
 * Formato esperado de data.json (esto es lo que devuelve Claude API):
 * {
 *   "pillar": "EDUCACIÓN MARCIAL",
 *   "slides": [
 *     { "title": "TU GUARDIA\nESTÁ MAL", "body": "Texto de desarrollo del punto..." },
 *     { "title": "POR QUÉ", "body": "..." }
 *   ]
 * }
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

async function main() {
  const dataPath = process.argv[2] || 'data.json';
  if (!fs.existsSync(dataPath)) {
    console.error(`No se encontró el archivo: ${dataPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const templateRaw = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  const total = data.slides.length;
  const generatedFiles = [];

  for (let i = 0; i < total; i++) {
    const slide = data.slides[i];
    const html = templateRaw
      .replaceAll('{{TITLE}}', escapeHtml(slide.title || ''))
      .replaceAll('{{BODY}}', escapeHtml(slide.body || ''))
      .replaceAll('{{SLIDE_NUM}}', i + 1)
      .replaceAll('{{TOTAL}}', total)
      .replaceAll('{{PILLAR}}', escapeHtml(data.pillar || ''));

    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Esperar a que la fuente Anton cargue antes de capturar
    await page.evaluateHandle('document.fonts.ready');

    const fileName = `slide-${String(i + 1).padStart(2, '0')}.png`;
    const filePath = path.join(outputDir, fileName);
    await page.screenshot({ path: filePath });
    generatedFiles.push(filePath);
    console.log(`Generado: ${filePath}`);
  }

  await browser.close();

  // Guarda un manifest simple para el paso siguiente (subida a Cloudinary)
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({ files: generatedFiles.map((f) => path.basename(f)) }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
