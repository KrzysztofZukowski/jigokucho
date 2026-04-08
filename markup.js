// markup.js — parser formuł i tagów (używany w techniki.js i ekwipunek.js)

const STAT_ALIASES = {
  strength:'strength', str:'strength', vitality:'vitality', vit:'vitality',
  speed:'speed', spd:'speed', defense:'defense', def:'defense',
  reiatsu:'reiatsu', rei:'reiatsu', reiryoku:'reiryoku', ryo:'reiryoku',
  bujutsu:'bujutsu', buj:'bujutsu', hakuda:'bujutsu',
  bukijutsu:'bukijutsu', buk:'bukijutsu', zanjutsu:'bukijutsu', kyudo:'bukijutsu',
  tamashi:'tamashi', tam:'tamashi', nazo:'nazo',
};
function resolveStatKey(n) { return STAT_ALIASES[n.toLowerCase().trim()] ?? n.toLowerCase().trim(); }

function evalFormula(raw, stats) {
  const breakdown = []; let value = 0;
  const termRe = /([\d.]+)\s*[x*×]\s*\[([\w ]+)\]|\[([\w ]+)\](?:\s*[x*×]\s*([\d.]+))?|([\d.]+)/g;
  let m;
  while ((m = termRe.exec(raw.replace(/\s+/g, ' '))) !== null) {
    if (m[1] !== undefined) {
      const coef = parseFloat(m[1]), key = resolveStatKey(m[2]), sv = Number(stats?.[key] ?? 0);
      breakdown.push({ coef, stat: m[2], sv, part: coef * sv }); value += coef * sv;
    } else if (m[3] !== undefined) {
      const coef = m[4] !== undefined ? parseFloat(m[4]) : 1, key = resolveStatKey(m[3]), sv = Number(stats?.[key] ?? 0);
      breakdown.push({ coef, stat: m[3], sv, part: coef * sv }); value += coef * sv;
    } else if (m[5] !== undefined) {
      const num = parseFloat(m[5]); breakdown.push({ coef: null, stat: null, sv: null, part: num }); value += num;
    }
  }
  if (!breakdown.length) return null;
  const result  = Math.round(value * 100) / 100;
  const details = breakdown.map(b => b.stat === null ? String(b.part) : `${b.coef !== 1 ? b.coef + '×' : ''}${b.stat}[${b.sv}]`).join(' + ');
  return `**${result}** \`(${details})\``;
}

const FORMULA_RE = /(?:[\d.]+\s*[x*×]\s*)?\[[\w ]+\](?:\s*[+\-]\s*(?:[\d.]+\s*[x*×]\s*)?\[[\w ]+\])*(?:\s*[+\-]\s*[\d.]+)?/g;

function convertMarkup(text, stats) {
  if (!text) return '';
  let r = text.replace(/`([^`\n]+)`/g, (_, inner) => {
    if (/\[[\w ]+\]/.test(inner)) return evalFormula(inner.trim(), stats) ?? inner;
    return `\`${inner}\``;
  });
  r = r.replace(/\{([^|{}\n]+)\|([^}\n]+)\}/g, (_, color, content) => {
    const c = color.toLowerCase().trim();
    if (c === 'muted' || c === 'dim') return `\`${content}\``;
    if (c === 'red')                  return `**${content}**`;
    return content;
  });
  FORMULA_RE.lastIndex = 0;
  r = r.replace(FORMULA_RE, (match) => evalFormula(match, stats) ?? match);
  return r;
}

module.exports = { convertMarkup };
