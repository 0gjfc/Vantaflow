// Procedural placeholder artwork (SVG data URIs), cached per item.
// Real art wins: set `cover` (box art incl. PS4 band) or `iconImage` (square icon0) on an item.
import { ICONS, esc } from './ui.js';

const W = 550;
const H = 698;
const cache = new Map();

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const FONTS = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  wide: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
};

// Silhouette layers per motif. c = [dark, mid, light, highlight].
const MOTIFS = {
  mountains: (c, r) => `<circle cx="${380 + r() * 60}" cy="250" r="70" fill="${c[3]}" opacity=".85"/>
    <path d="M0 470L120 300L190 360L320 190L450 360L550 280V698H0Z" fill="${c[1]}"/>
    <path d="M0 560L140 410L250 500L390 380L550 520V698H0Z" fill="${c[0]}"/>
    <path d="M300 190l20 30 14-10 20 40" stroke="${c[2]}" stroke-width="5" fill="none" opacity=".7"/>`,
  city: (c, r) => {
    let s = '';
    for (let x = 0; x < W; x += 34 + r() * 26) {
      const h = 140 + r() * 260, w = 30 + r() * 40;
      s += `<rect x="${x}" y="${560 - h}" width="${w}" height="${h + 140}" fill="${c[0]}"/>`;
      for (let y = 580 - h; y < 540; y += 22) if (r() > 0.55) s += `<rect x="${x + 6 + r() * (w - 14)}" y="${y}" width="5" height="8" fill="${c[3]}" opacity="${0.4 + r() * 0.5}"/>`;
    }
    return `<rect y="560" width="${W}" height="140" fill="${c[1]}" opacity=".6"/>${s}`;
  },
  ship: (c) => `<path d="M0 520Q140 480 275 520T550 520V698H0Z" fill="${c[1]}"/>
    <path d="M190 470h190l-30 50H220Z" fill="${c[0]}"/><path d="M285 190v280M285 210l-90 230h90ZM290 230l80 200h-80Z" fill="${c[3]}" stroke="${c[0]}" stroke-width="4" opacity=".92"/>
    <path d="M0 600Q140 560 275 600T550 600V698H0Z" fill="${c[0]}"/>`,
  road: (c) => `<rect y="430" width="${W}" height="268" fill="${c[0]}"/><path d="M230 430h90l230 268H0Z" fill="${c[1]}"/>
    <path d="M272 440h6l20 258h-46Z" fill="${c[3]}" opacity=".8"/><path d="M60 330h430l-40 70H100Z" fill="${c[2]}" opacity=".9"/>
    <path d="M100 400h350l-20 40H120Z" fill="${c[0]}"/><circle cx="140" cy="420" r="16" fill="${c[3]}"/><circle cx="410" cy="420" r="16" fill="${c[3]}"/>`,
  ruins: (c) => `<path d="M0 560H550V698H0Z" fill="${c[0]}"/>${[60, 150, 330, 430].map((x, i) => `<rect x="${x}" y="${260 + i * 25}" width="44" height="${320 - i * 25}" fill="${c[1]}"/>`).join('')}
    <path d="M200 560V300a75 75 0 0 1 150 0V560" fill="none" stroke="${c[1]}" stroke-width="30"/><circle cx="275" cy="260" r="34" fill="${c[3]}" opacity=".35"/>`,
  planet: (c) => `<circle cx="330" cy="330" r="160" fill="${c[2]}"/><circle cx="380" cy="300" r="160" fill="${c[1]}" opacity=".7"/>
    <ellipse cx="330" cy="330" rx="260" ry="46" fill="none" stroke="${c[3]}" stroke-width="6" opacity=".7" transform="rotate(-18 330 330)"/>
    <circle cx="110" cy="200" r="30" fill="${c[3]}" opacity=".6"/><path d="M0 600Q275 540 550 600V698H0Z" fill="${c[0]}"/>`,
  forest: (c, r) => {
    let s = '';
    for (let i = 0; i < 16; i++) {
      const x = r() * W, h = 160 + r() * 220, y = 600 - r() * 60;
      s += `<path d="M${x} ${y - h}L${x + 45} ${y}H${x - 45}Z" fill="${i % 2 ? c[0] : c[1]}"/>`;
    }
    return `<circle cx="275" cy="300" r="120" fill="${c[3]}" opacity=".25"/>${s}<rect y="590" width="${W}" height="110" fill="${c[0]}"/>`;
  },
  peaks: (c) => `<path d="M0 520L150 250L230 360L330 170L470 400L550 330V698H0Z" fill="${c[2]}"/>
    <path d="M150 250l30 55-28-10-25 30zM330 170l40 75-36-12-30 40z" fill="${c[3]}"/>
    <path d="M0 600L170 470L300 560L440 450L550 520V698H0Z" fill="${c[1]}"/>`,
  mask: (c) => `<path d="M275 160c110 0 160 90 160 200 0 130-80 230-160 230S115 490 115 360c0-110 50-200 160-200z" fill="${c[1]}"/>
    <path d="M180 330q45-30 80 5-40 25-80-5zM370 330q-45-30-80 5 40 25 80-5z" fill="${c[2]}"/><path d="M275 160v430" stroke="${c[2]}" stroke-width="3" opacity=".6"/>`,
  sun: (c) => `<circle cx="275" cy="420" r="170" fill="${c[2]}"/>${[0, 1, 2, 3, 4].map((i) => `<rect y="${440 + i * 26}" width="${W}" height="${6 + i * 3}" fill="${c[1]}"/>`).join('')}
    <path d="M0 560Q140 520 275 560T550 560V698H0Z" fill="${c[0]}"/>`,
  waves: (c) => [0, 1, 2, 3].map((i) => `<path d="M0 ${430 + i * 60}Q90 ${390 + i * 60} 180 ${430 + i * 60}T360 ${430 + i * 60}T550 ${430 + i * 60}V698H0Z" fill="${i % 2 ? c[0] : c[1]}" opacity="${0.6 + i * 0.13}"/>`).join(''),
  moon: (c) => `<circle cx="360" cy="240" r="90" fill="${c[3]}"/><circle cx="395" cy="215" r="80" fill="${c[1]}"/>
    ${[90, 170, 260, 350, 450].map((x, i) => `<circle cx="${x}" cy="${560 - (i % 2) * 30}" r="${50 + (i % 3) * 14}" fill="${c[0]}"/>`).join('')}<rect y="580" width="${W}" height="120" fill="${c[0]}"/>`,
};

// Approximate uppercase glyph width per font (× font size), used to fit titles in 470 px.
const CHAR_W = { serif: 0.78, sans: 0.7, wide: 0.86 };

// Long titles go on two lines, broken at the space nearest the middle.
function splitTitle(t) {
  if (t.length <= 12 || !t.includes(' ')) return [t];
  let best = -1;
  for (let i = t.indexOf(' '); i !== -1; i = t.indexOf(' ', i + 1)) if (best < 0 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2)) best = i;
  return [t.slice(0, best), t.slice(best + 1)];
}

function svgURI(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function coverArt(item) {
  if (item.cover) return item.cover;
  const key = `c:${item.id}`;
  if (cache.has(key)) return cache.get(key);
  const { motif = 'mountains', colors: c, font = 'sans', tagline = '' } = item.art;
  const r = rng(item.id);
  const lines = splitTitle(item.title.toUpperCase());
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.floor(Math.min(64, 470 / (longest * CHAR_W[font])));
  const lineH = size * 1.05;
  const titleSVG = lines.map((l, i) => `<tspan x="${W / 2}" y="${H - 108 - (lines.length - 1 - i) * lineH}">${esc(l)}</tspan>`).join('');
  let stars = '';
  for (let i = 0; i < 40; i++) stars += `<circle cx="${r() * W}" cy="${90 + r() * 300}" r="${0.6 + r() * 1.6}" fill="#fff" opacity="${0.15 + r() * 0.6}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>
    <radialGradient id="v" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>${stars}${(MOTIFS[motif] || MOTIFS.mountains)(c, r)}
    <rect width="${W}" height="${H}" fill="url(#v)"/><rect y="${H - 230}" width="${W}" height="230" fill="url(#b)"/>
    <text text-anchor="middle" font-family="${FONTS[font]}" font-weight="${font === 'serif' ? 700 : 900}" font-size="${size}" letter-spacing="${font === 'serif' ? 3 : 1}" fill="${c[3]}" stroke="#000" stroke-opacity=".35" stroke-width="1.5">${titleSVG}</text>
    <text x="${W / 2}" y="${H - 70}" text-anchor="middle" font-family="${FONTS.sans}" font-size="18" letter-spacing="6" fill="${c[3]}" opacity=".8">${esc(tagline.toUpperCase())}</text>
    <text x="${W - 22}" y="${H - 20}" text-anchor="end" font-family="${FONTS.sans}" font-size="13" letter-spacing="2" fill="#fff" opacity=".55">${esc((item.publisher || '').toUpperCase())}</text>
  </svg>`;
  const uri = svgURI(svg);
  cache.set(key, uri);
  return uri;
}

export function iconArt(item) {
  if (item.iconImage) return item.iconImage;
  const key = `i:${item.id}`;
  if (cache.has(key)) return cache.get(key);
  const [a, b] = item.colors;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>
    <radialGradient id="h" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#h)"/>
    <g transform="translate(136 96) scale(10)" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[item.icon] || ICONS.apps}</g>
    <text x="256" y="452" text-anchor="middle" font-family="${FONTS.sans}" font-weight="700" font-size="${Math.min(46, Math.floor(760 / Math.max(10, item.title.length)))}" fill="#fff">${esc(item.title)}</text>
  </svg>`;
  const uri = svgURI(svg);
  cache.set(key, uri);
  return uri;
}

// Markup for one cover. Procedural case art gets a CSS "PS4" case band; real box art already has one.
export function coverHTML(item, shape) {
  if (shape === 'square') return `<div class="cover square"><img src="${iconArt(item)}" alt="" draggable="false"></div>`;
  const band = item.cover ? '' : '<div class="band"><span>PS4</span></div>';
  return `<div class="cover case">${band}<img src="${coverArt(item)}" alt="" draggable="false"></div>`;
}
