// utils.js — pomocnicze funkcje używane w komendach

// ─── Nazwy statystyk per rasa ───────────────────────────────────────────────
const STAT_DISPLAY_NAMES = {
  bujutsu: {
    'Soul Reaper': 'Hakuda', 'Arrancar': 'Hakuda',
    'Quincy': 'Hakuda',      'Fullbringer': 'Hakuda',
    default: 'Bujutsu',
  },
  bukijutsu: {
    'Soul Reaper': 'Zanjutsu', 'Arrancar': 'Zanjutsu',
    'Quincy': 'Kyudo',         'Fullbringer': 'Bukijutsu',
    default: 'Bukijutsu',
  },
  tamashi: {
    'Soul Reaper': 'Zanpakuto Mastery', 'Arrancar': 'Zanpakuto Mastery',
    'Quincy': 'Blood Mastery',          'Fullbringer': 'Fullbring Mastery',
    default: 'Tamashi',
  },
};

function getStatName(stat, race) {
  return STAT_DISPLAY_NAMES[stat]?.[race]
      ?? STAT_DISPLAY_NAMES[stat]?.default
      ?? stat;
}

function findStatKeyByDisplayName(displayName, race) {
  const dn = displayName.toLowerCase().trim();
  const directMap = {
    strength: 'strength', vitality: 'vitality', speed: 'speed',
    defense: 'defense',   reiatsu: 'reiatsu',   reiryoku: 'reiryoku',
    bujutsu: 'bujutsu',   bukijutsu: 'bukijutsu', tamashi: 'tamashi',
    hakuda: 'bujutsu',
    zanjutsu: 'bukijutsu', kyudo: 'bukijutsu',
    'zanpakuto mastery': 'tamashi',
    'blood mastery': 'tamashi',
    'fullbring mastery': 'tamashi',
  };
  if (directMap[dn]) return directMap[dn];
  for (const [key, raceMap] of Object.entries(STAT_DISPLAY_NAMES)) {
    for (const [r, name] of Object.entries(raceMap)) {
      if (name.toLowerCase() === dn) return key;
    }
  }
  return null;
}

function isAdmin(interaction) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  if (adminRoleId) return interaction.member.roles.cache.has(adminRoleId);
  return interaction.member.permissions.has('Administrator');
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString('pl-PL');
}

function parseHexColor(hex) {
  if (!hex) return 0xdc3232;
  const clean = hex.replace('#', '').trim();
  const padded = clean.padStart(6, '0');
  const parsed = parseInt(padded, 16);
  return isNaN(parsed) ? 0xdc3232 : parsed;
}

function calcNDRFromReisen(reisenAbsorbed) {
  let remaining = reisenAbsorbed;
  let ndr = 0;
  let cost = 4;
  let countAtThisCost = 0;
  while (remaining >= cost) {
    remaining -= cost;
    ndr++;
    countAtThisCost++;
    if (countAtThisCost % 3 === 0) cost++;
  }
  return ndr;
}

function calcReisenSpentOnNDR(ndrFromReisen) {
  let spent = 0;
  let cost = 4;
  let countAtThisCost = 0;
  for (let i = 0; i < ndrFromReisen; i++) {
    spent += cost;
    countAtThisCost++;
    if (countAtThisCost % 3 === 0) cost++;
  }
  return spent;
}

function getReisenProgress(reisenAbsorbed) {
  const ndrFromReisen = calcNDRFromReisen(reisenAbsorbed);
  const spent = calcReisenSpentOnNDR(ndrFromReisen);
  const nextCost = 4 + Math.floor(ndrFromReisen / 3);
  const current = reisenAbsorbed - spent;
  return { current, nextCost, ndrFromReisen };
}

function progressBar(current, max, length = 10) {
  if (max <= 0) return '█'.repeat(length);
  const filled = Math.min(Math.floor((current / max) * length), length);
  const empty  = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function calcSpentNDR(unlockedNodes) {
  if (!unlockedNodes) return 0;
  let spent = 0;
  for (const statNodes of Object.values(unlockedNodes)) {
    if (typeof statNodes === 'object' && statNodes !== null) {
      for (const purchases of Object.values(statNodes)) {
        spent += Number(purchases) || 0;
      }
    }
  }
  return spent;
}

function countNodesForStat(unlockedNodes, stat) {
  const statNodes = unlockedNodes?.[stat];
  if (!statNodes || typeof statNodes !== 'object') return 0;
  return Object.values(statNodes).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function parseFormulas(text, stats, race) {
  if (!text || !stats) return text;
  return text.replace(/(\d+(?:[.,]\d+)?)x\[([^\]]+)\]/gi, (match, multiplier, statName) => {
    const mult    = parseFloat(multiplier.replace(',', '.'));
    const statKey = findStatKeyByDisplayName(statName, race);
    if (!statKey) return match;
    const statVal = Number(stats[statKey] ?? 0);
    const result  = (mult * statVal).toFixed(1);
    return `**${result}** *(${mult}×${statName}[${statVal}])*`;
  });
}

function statRow(label, value, nodes) {
  const nodeStr    = (nodes > 0) ? ` 〔${nodes}🌿〕` : '';
  const paddedLabel = String(label).slice(0, 20).padEnd(20, ' ');
  return `\`${paddedLabel}\` **${fmt(value)}**${nodeStr}`;
}

module.exports = {
  getStatName, findStatKeyByDisplayName, isAdmin, fmt,
  parseHexColor, calcNDRFromReisen, getReisenProgress,
  progressBar, calcSpentNDR, countNodesForStat, parseFormulas, statRow,
};

// ─── Cache kolorów reiatsu (5 min TTL) ────────────────────────────────────
const _colorCache = new Map();
const _COLOR_TTL  = 5 * 60 * 1000;

/**
 * Zwraca kolor reiatsu gracza jako liczba Discord (lub fallback COLOR.RED).
 * Używa cache żeby nie odpytywać Firestore przy każdej komendzie.
 */
async function getUserColor(discordId, db, fallback = 0xdc3232) {
  const cached = _colorCache.get(discordId);
  if (cached && cached.expires > Date.now()) return cached.color;

  try {
    const linkDoc = await db.collection('discordLinks').doc(discordId).get();
    if (!linkDoc.exists) { _colorCache.set(discordId, { color: fallback, expires: Date.now() + _COLOR_TTL }); return fallback; }
    const { identifier } = linkDoc.data();
    const snap = await db.collection('characters').where('identifier', '==', identifier).limit(1).get();
    if (snap.empty) { _colorCache.set(discordId, { color: fallback, expires: Date.now() + _COLOR_TTL }); return fallback; }
    const hex = snap.docs[0].data()?.riatsuColor?.hex;
    const color = hex ? parseInt(hex.replace('#', ''), 16) : fallback;
    _colorCache.set(discordId, { color, expires: Date.now() + _COLOR_TTL });
    return color;
  } catch {
    return fallback;
  }
}

module.exports.getUserColor = getUserColor;
