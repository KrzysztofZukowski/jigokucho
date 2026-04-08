// statCalc.js
// Kolejność: base + treeFlat + itemFlat → × (1 + totalPercent/100) → × modeMultipliers
// Wynik: floor(finalPrecise) do wyświetlania, finalPrecise (float) do formuł HP/RP

const ALL_STATS = [
  'strength', 'vitality', 'speed', 'defense',
  'reiatsu', 'reiryoku', 'bujutsu', 'bukijutsu', 'tamashi', 'nazo',
];

let ALL_TREE_NODES = {};
try { ALL_TREE_NODES = require('./allTreeNodes.json'); } catch (_) {}

// ─── treeFlat ─────────────────────────────────────────────────────────────
function calcTreeFlat(stat, unlockedNodes, customNodes = {}) {
  let treeFlat = 0;
  for (const [, nodeMap] of Object.entries(unlockedNodes)) {
    if (!nodeMap || typeof nodeMap !== 'object') continue;
    for (const [nodeId, count] of Object.entries(nodeMap)) {
      if (!count || count <= 0) continue;
      const node  = customNodes[nodeId] ?? ALL_TREE_NODES[nodeId];
      if (!node) continue;
      const grant = Number(node.statGrants?.[stat] ?? 0);
      if (grant) treeFlat += grant * count;
    }
  }
  return treeFlat;
}

// ─── Mode multiplier dla jednego statu ────────────────────────────────────
function calcModeMultiplier(stat, modes = []) {
  let mult = 1;
  for (const mode of modes) {
    if (!mode.active) continue;
    for (const m of (mode.multipliers ?? [])) {
      if (String(m.stat ?? '').toLowerCase().trim() === stat) {
        mult *= Number(m.factor ?? 1);
      }
    }
  }
  return mult;
}

// ─── Parser formuł HP/RP ──────────────────────────────────────────────────
// Format: "1x[Vitality]", "2x[Vitality]+0.5x[Strength]+100"
function calcFormula(formula, effectiveFloats) {
  if (!formula?.trim()) return null;

  const STAT_ALIASES = {
    strength:'strength', str:'strength',
    vitality:'vitality', vit:'vitality',
    speed:'speed',       spd:'speed',
    defense:'defense',   def:'defense',
    reiatsu:'reiatsu',   rei:'reiatsu',
    reiryoku:'reiryoku', ryo:'reiryoku',
    bujutsu:'bujutsu',   buj:'bujutsu',   hakuda:'bujutsu',
    bukijutsu:'bukijutsu', buk:'bukijutsu', zanjutsu:'bukijutsu', kyudo:'bukijutsu',
    tamashi:'tamashi',   tam:'tamashi',
    nazo:'nazo',
  };

  let total = 0;
  // Match: Nx[StatName] or [StatName]xN or plain number
  const termRe = /([\d.]+)\s*[x*×]\s*\[([\w ]+)\]|\[([\w ]+)\]\s*[x*×]\s*([\d.]+)|([\d.]+)/gi;
  let m;
  while ((m = termRe.exec(formula)) !== null) {
    if (m[1] !== undefined) {
      const factor  = parseFloat(m[1]);
      const statKey = STAT_ALIASES[m[2].toLowerCase().trim()] ?? m[2].toLowerCase().trim();
      total += factor * (effectiveFloats[statKey] ?? 0);
    } else if (m[3] !== undefined) {
      const factor  = parseFloat(m[4]);
      const statKey = STAT_ALIASES[m[3].toLowerCase().trim()] ?? m[3].toLowerCase().trim();
      total += factor * (effectiveFloats[statKey] ?? 0);
    } else if (m[5] !== undefined) {
      total += parseFloat(m[5]);
    }
  }
  return Math.round(total);
}

// ─── Główna kalkulacja ─────────────────────────────────────────────────────
/**
 * @param {object} char              - dokument postaci z Firestore
 * @param {Array}  items             - wszystkie itemy gracza
 * @param {object} [firestoreNodes]  - opcjonalne nadpisania węzłów z Firestore
 * @returns {{
 *   stats: { stat: { base, treeFlat, itemFlat, pctSum, modeMult, precise, display, hasBonus } },
 *   hp:    number,   // max HP (zaokrąglone)
 *   rp:    number,   // max RP (zaokrąglone)
 *   activeModes: []  // aktywne mode'y
 * }}
 */
function calcEffectiveFull(char, items = [], firestoreNodes = {}) {
  const baseStats     = char.stats          ?? {};
  const unlockedNodes = char.unlockedNodes  ?? {};
  const statMults     = char.statMultipliers ?? [];
  const modes         = char.modes          ?? [];
  const equippedItems = items.filter(i => i.equipped === true && i.itemType === 'equipment');

  const nazoNodeMap = {};
  for (const node of (char.nazoNodes ?? [])) nazoNodeMap[node.id] = node;
  const customNodes = { ...nazoNodeMap, ...firestoreNodes };

  const activeModes = modes.filter(m => m.active);
  const statsResult = {};
  const floats      = {}; // stat → precise float (do formuł HP/RP)

  for (const stat of ALL_STATS) {
    const base     = Number(baseStats[stat] ?? 0);
    const treeFlat = calcTreeFlat(stat, unlockedNodes, customNodes);

    let itemFlat = 0, pctSum = 0;
    for (const item of equippedItems) {
      for (const b of (item.statBonuses ?? [])) {
        if (String(b.stat ?? '').toLowerCase().trim() !== stat) continue;
        if (b.flat)    itemFlat += Number(b.flat    ?? 0);
        if (b.percent) pctSum   += Number(b.percent ?? 0);
      }
    }
    for (const m of statMults) {
      if (String(m.stat ?? '').toLowerCase().trim() === stat) pctSum += Number(m.percent ?? 0);
    }

    const afterFlat    = base + treeFlat + itemFlat;
    const afterPercent = pctSum !== 0 ? afterFlat * (1 + pctSum / 100) : afterFlat;
    const modeMult     = calcModeMultiplier(stat, activeModes);
    const precise      = afterPercent * modeMult;
    const display      = Math.floor(precise);

    floats[stat]       = precise;
    statsResult[stat]  = { base, treeFlat, itemFlat, pctSum, modeMult, precise, display,
      effective: display, // compat alias
      hasBonus: display !== base };
  }

  // HP i RP
  const hpFormula = char.hpFormula ?? '1x[Vitality]';
  const rpFormula = char.rpFormula ?? '1x[Reiatsu]';
  const hp        = calcFormula(hpFormula, floats) ?? Math.round(floats.vitality ?? 0);
  const rp        = calcFormula(rpFormula, floats) ?? Math.round(floats.reiatsu  ?? 0);

  return { stats: statsResult, hp, rp, activeModes, floats };
}

// ─── Compat wrappers ──────────────────────────────────────────────────────
function calcEffective(char, items = [], firestoreNodes = {}) {
  return calcEffectiveFull(char, items, firestoreNodes).stats;
}

function effectivePlain(char, items = [], firestoreNodes = {}) {
  const { floats } = calcEffectiveFull(char, items, firestoreNodes);
  // effectivePlain zwraca display (floor) dla komend, ale floats dla wewnętrznych obliczeń
  const plain = {};
  for (const [s, v] of Object.entries(floats)) plain[s] = Math.floor(v);
  return plain;
}

module.exports = { calcEffective, calcEffectiveFull, effectivePlain, ALL_STATS, calcFormula };
