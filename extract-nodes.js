// extract-nodes.js — generuje pliki JSON potrzebne botowi
// Uruchom gdy masz nową wersję defaultSkillTrees.js i chcesz zaktualizować fallback:
//   node extract-nodes.js C:\Users\zukow\Documents\Bleach\black-outpost\src\data\defaultSkillTrees.js
//
// Generuje dwa pliki:
//   allTreeNodes.json     — WSZYSTKIE węzły (do obliczania statystyk)
//   defaultSkillNodes.json — węzły z tagiem "passive" (do /pasywne)

const fs   = require('node:fs');
const path = require('node:path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Użycie: node extract-nodes.js <ścieżka/do/defaultSkillTrees.js>');
  process.exit(1);
}

const absInput = path.resolve(inputPath);
if (!fs.existsSync(absInput)) {
  console.error(`Plik nie istnieje: ${absInput}`);
  process.exit(1);
}

let content = fs.readFileSync(absInput, 'utf8');
content = content.replace(/^export const /gm, 'module.exports.');
const tmpPath = path.join(__dirname, '_extract_tmp.js');
fs.writeFileSync(tmpPath, content);

let data;
try { data = require(tmpPath); }
finally { try { fs.unlinkSync(tmpPath); } catch(_) {} }

const trees = data.DEFAULT_SKILL_TREES ?? data;

const allNodes     = {};  // nodeId → pełne dane węzła (do obliczeń statystyk)
const passiveNodes = {};  // nodeId → dane węzła (do /pasywne)
let cntAll = 0, cntPassive = 0;

for (const [stat, tree] of Object.entries(trees)) {
  for (const node of tree.nodes ?? []) {
    // Każdy węzeł — do obliczeń statystyk
    allNodes[node.id] = {
      id:         node.id,
      type:       node.type,
      treeStat:   stat,
      statGrants: node.statGrants ?? {},
      tags:       node.tags ?? [],
      passiveName:      node.passiveName      ?? null,
      label:            node.label            ?? '',
      shortDescription: node.shortDescription ?? '',
      longDescription:  node.longDescription  ?? node.description ?? '',
      tier:             node.tier ?? 1,
    };
    cntAll++;

    // Pasywne — tylko węzły z tagiem "passive"
    if (Array.isArray(node.tags) && node.tags.includes('passive')) {
      passiveNodes[node.id] = allNodes[node.id];
      cntPassive++;
    }
  }
}

const allPath     = path.join(__dirname, 'allTreeNodes.json');
const passivePath = path.join(__dirname, 'defaultSkillNodes.json');

fs.writeFileSync(allPath,     JSON.stringify(allNodes,     null, 2), 'utf8');
fs.writeFileSync(passivePath, JSON.stringify(passiveNodes, null, 2), 'utf8');

console.log(`✅ allTreeNodes.json     — ${cntAll} węzłów`);
console.log(`✅ defaultSkillNodes.json — ${cntPassive} węzłów pasywnych`);
if (cntPassive === 0) {
  console.log('\n⚠️  Zero węzłów pasywnych — sprawdź czy drzewka mają tag "passive".');
}
