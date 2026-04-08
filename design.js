// design.js — wspólne stałe designu dla wszystkich komend

// ─── Obrazy ────────────────────────────────────────────────────────────────
const IMG = {
  BACKGROUND: 'https://i.imgur.com/dg2BvAB.png',
  BO_LOGO:    'https://i.imgur.com/OhlupcH.png',
  BUTTERFLY:  'https://i.imgur.com/w2SeCYS.png',
};

// ─── Kolory domyślne ───────────────────────────────────────────────────────
const COLOR = {
  RED:    0xdc3232,
  DARK:   0x111118,
  MUTED:  0x2e2e3f,
};

// ─── Symbole ras (Unicode, bez emoji) ─────────────────────────────────────
const RACE_SYMBOLS = {
  'Soul Reaper': '†',   // krzyż — shinigami, Bóg Śmierci
  'Arrancar':    '◉',   // puste kółko — hollow/maska
  'Quincy':      '✛',   // krzyż Quincy
  'Fullbringer': '◈',   // diament z punktem
};
function raceSymbol(race) {
  return RACE_SYMBOLS[race] ?? '◆';
}

// ─── Linia separatora ──────────────────────────────────────────────────────
const SEP = '─────────────────────';

// ─── Parsowanie koloru hex (obsługa skróconych wartości jak #f0006) ────────
function parseHexColor(hex) {
  if (!hex) return COLOR.RED;
  const clean  = hex.replace('#', '').trim();
  const padded = clean.padStart(6, '0');
  const parsed = parseInt(padded, 16);
  return isNaN(parsed) ? COLOR.RED : parsed;
}

// ─── Formatowanie liczb ────────────────────────────────────────────────────
function fmt(n) {
  return Number(n ?? 0).toLocaleString('pl-PL');
}

// ─── Wiersz statystyki z wyrównaniem ──────────────────────────────────────
// label: maks 18 znaków, value i nodeStr opcjonalne
function statLine(label, value, nodes) {
  const nodeStr = nodes > 0 ? `  ‹${nodes}›` : '';
  return `\`${label.slice(0, 18).padEnd(18)}\`  **${fmt(value)}**${nodeStr}`;
}

// ─── Pasek postępu ─────────────────────────────────────────────────────────
function progressBar(current, max, len = 12) {
  if (max <= 0) return '█'.repeat(len);
  const filled = Math.min(Math.round((current / max) * len), len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

// ─── Standard author / footer ──────────────────────────────────────────────
function boAuthor(subtitle) {
  return {
    name:    subtitle ? `◈  BLACK OUTPOST  ·  ${subtitle}` : '◈  BLACK OUTPOST',
    iconURL: IMG.BO_LOGO,
  };
}
function boFooter(text) {
  return {
    text:    text ?? '◈  BLACK OUTPOST SYSTEM',
    iconURL: IMG.BUTTERFLY,
  };
}

module.exports = {
  IMG, COLOR, SEP,
  raceSymbol, parseHexColor, fmt, statLine, progressBar,
  boAuthor, boFooter,
};
