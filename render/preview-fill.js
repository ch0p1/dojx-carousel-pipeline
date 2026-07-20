// preview-fill.js — genera HTML estático de cada slide para abrir en el navegador
// (no requiere Puppeteer, solo llena los placeholders de texto)
const fs = require('fs');
const path = require('path');

function fillTemplate(template, replacements) {
  let out = template;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  return out;
}

const contentTemplate = fs.readFileSync(path.join(__dirname, 'template-content.html'), 'utf-8');
const ctaTemplate = fs.readFileSync(path.join(__dirname, 'template-cta.html'), 'utf-8');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf-8'));
const accentColor = data.accent_color || '#C41E1E';
const outDir = path.join(__dirname, 'preview-slides');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

data.slides.forEach((slide, i) => {
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
      LOGO_COLOR: isPhoto ? '#FFFFFF' : '#FFFFFF',
    });
  }
  const fileName = `slide-${String(i + 1).padStart(2, '0')}.html`;
  fs.writeFileSync(path.join(outDir, fileName), html);
  console.log('Generado', fileName);
});
