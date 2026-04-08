// commands/pasywne.js
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags,
} = require('discord.js');
const { db }                                     = require('../firebase');
const { isAdmin }                                = require('../utils');
const { SEP, parseHexColor, boAuthor, boFooter } = require('../design');
const { convertMarkup }                          = require('../markup');
const { effectivePlain }                         = require('../statCalc');

// Fallback JSON — zawiera węzły pasywne ze starszej wersji drzewek.
// Zaktualizuj go poleceniem:  node extract-nodes.js <ścieżka/do/defaultSkillTrees.js>
let DEFAULT_PASSIVE_NODES = {};
try { DEFAULT_PASSIVE_NODES = require('../defaultSkillNodes.json'); } catch (_) {}

const STAT_LABELS = {
  strength:'Strength', vitality:'Vitality', speed:'Speed', defense:'Defense',
  reiatsu:'Reiatsu', reiryoku:'Reiryoku', bujutsu:'Bujutsu',
  bukijutsu:'Bukijutsu', tamashi:'Tamashi', nazo:'???',
};

// ─── Pobierz postać ────────────────────────────────────────────────────────
async function fetchCharByDiscordId(discordId) {
  const linkDoc = await db.collection('discordLinks').doc(discordId).get();
  if (!linkDoc.exists) return null;
  const { identifier } = linkDoc.data();
  const snap = await db.collection('characters').where('identifier', '==', identifier).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── Załaduj drzewka z Firestore ─────────────────────────────────────────
// Zwraca mapę nodeId → nodeData dla węzłów z tagiem "passive"
async function loadPassiveNodesFromFirestore() {
  const result = {};
  try {
    const snap = await db.collection('skillTrees').where('isDefault', '==', true).get();
    for (const doc of snap.docs) {
      const { stat, nodes = [] } = doc.data();
      for (const node of nodes) {
        if (!Array.isArray(node.tags) || !node.tags.includes('passive')) continue;
        result[node.id] = { ...node, stat };
      }
    }
    console.log(`[PASYWNE] Załadowano ${Object.keys(result).length} węzłów pasywnych z Firestore`);
  } catch (err) {
    console.warn('[PASYWNE] Błąd Firestore skillTrees:', err.message);
  }
  return result;
}

// ─── Pobierz nazwę i opisy węzła ─────────────────────────────────────────
function nodeDisplayName(node) {
  // passiveName → label → id
  return node.passiveName || node.label || node.id || 'Nieznany';
}
function nodeShortDesc(node) {
  // shortDescription (plain text bez formuł, do listy)
  return node.shortDescription || '';
}
function nodeLongDesc(node) {
  // longDescription → description (może zawierać formuły)
  return node.longDescription || node.description || '';
}

// ─── Zbierz wszystkie efekty pasywne gracza ────────────────────────────────
async function collectPassives(char) {
  const unlockedNodes  = char.unlockedNodes ?? {};
  const passives       = [];

  // ── 1. Pasywne z drzewek (węzły z tagiem "passive") ────────────────────
  // Najpierw próbuj Firestore, potem fallback JSON
  const firestorePassives = await loadPassiveNodesFromFirestore();
  const allPassiveNodes   = Object.keys(firestorePassives).length
    ? firestorePassives
    : DEFAULT_PASSIVE_NODES;

  for (const [stat, nodeMap] of Object.entries(unlockedNodes)) {
    if (!nodeMap || typeof nodeMap !== 'object') continue;
    for (const [nodeId, count] of Object.entries(nodeMap)) {
      if (!count || count <= 0) continue; // pomiń nieopłacone

      const node = allPassiveNodes[nodeId];
      if (!node) continue; // nie jest węzłem pasywnym

      passives.push({
        id:               nodeId,
        name:             nodeDisplayName(node),
        shortDescription: nodeShortDesc(node),
        longDescription:  nodeLongDesc(node),
        stat:             node.stat ?? stat,
        tier:             node.tier ?? 1,
        pinned:           node.pinned ?? false,
        source:           'skillTree',
      });
    }
  }

  // ── 2. Nazo drzewko ─────────────────────────────────────────────────────
  if (char.nazoUnlocked) {
    const nazoNodes    = char.nazoNodes ?? [];
    const nazoUnlocked = unlockedNodes.nazo ?? {};
    for (const node of nazoNodes) {
      if (!Array.isArray(node.tags) || !node.tags.includes('passive')) continue;
      const count = nazoUnlocked[node.id];
      if (!count || count <= 0) continue;
      passives.push({
        id:               node.id,
        name:             nodeDisplayName(node),
        shortDescription: nodeShortDesc(node),
        longDescription:  nodeLongDesc(node),
        stat:             'nazo',
        tier:             node.tier ?? 1,
        pinned:           node.pinned ?? false,
        source:           'nazo',
      });
    }
  }

  // ── 3. Efekty nadane przez admina: character.passiveEffects[] ──────────
  // Struktura: { id, name, description, grantedAt }
  const adminEffects = char.passiveEffects ?? [];
  for (const effect of adminEffects) {
    if (!effect || !effect.name) continue;
    passives.push({
      id:               effect.id ?? `admin_${effect.name}`,
      name:             effect.name,
      shortDescription: '',
      longDescription:  effect.description ?? '',
      stat:             null,
      tier:             null,
      pinned:           effect.pinned ?? false,
      source:           'admin',
      grantedAt:        effect.grantedAt,
    });
  }

  // Deduplikacja
  const seen = new Set();
  const deduped = passives.filter(p => {
    if (!p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  console.log(`[PASYWNE] ${char.identifier ?? char.id}: ${deduped.length} efektów — ${deduped.map(p=>p.name).join(', ')}`);
  return deduped;
}

// ─── Sortowanie ────────────────────────────────────────────────────────────
function sortPassives(arr) {
  return [...arr].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

// ─── Embed listy ────────────────────────────────────────────────────────────
function buildListEmbed(char, passives, color) {
  const name   = `${char.firstName ?? ''} ${char.lastName ?? ''}`.trim();
  const sorted = sortPassives(passives);

  const lines = sorted.map((p, i) => {
    const pin  = p.pinned ? '📌 ' : '';
    const src  = p.source === 'admin' ? '  ·  *admin*' : '';
    const stat = p.stat ? `  ·  \`${(STAT_LABELS[p.stat] ?? p.stat).toUpperCase()}\`` : '';
    // shortDescription to plain-text skrót, longDescription może mieć formuły
    const desc = p.shortDescription || p.longDescription.replace(/\{[^|{}]+\|([^}]+)\}/g,'$1').replace(/`[^`]+`/g,'…').slice(0, 80);
    const descLine = desc ? `\n   ${desc.length > 80 ? desc.slice(0,80)+'…' : desc}` : '';
    return `**${i+1}.** ${pin}**${p.name}**${stat}${src}${descLine}`;
  });

  return new EmbedBuilder()
    .setAuthor(boAuthor(`EFEKTY PASYWNE  ·  ${name}`))
    .setColor(color)
    .setDescription(
      lines.length
        ? lines.join('\n\n').slice(0, 4000)
          + `\n\n${SEP}\n*Wybierz efekt z menu poniżej, by zobaczyć **pełny opis z obliczeniami**.*`
        : '✕  Brak efektów pasywnych.',
    )
    .setFooter(boFooter(`${passives.length} efektów`));
}

// ─── Embed szczegółów — pełny opis z obliczeniami ─────────────────────────
function buildPassiveEmbed(passive, char, effStats, color) {
  // longDescription parsowany przez markup (formuły 0.2x[Stat] → wartości)
  const fullDesc = convertMarkup(passive.longDescription ?? '', effStats);
  const statName = passive.stat ? (STAT_LABELS[passive.stat] ?? passive.stat) : null;

  const embed = new EmbedBuilder()
    .setAuthor(boAuthor(passive.name))
    .setColor(color)
    .setDescription(fullDesc || '*Brak opisu.*');

  const fields = [];
  if (statName)       fields.push({ name: 'Drzewo',  value: statName,            inline: true });
  if (passive.tier)   fields.push({ name: 'Tier',    value: String(passive.tier), inline: true });
  if (passive.source === 'admin') fields.push({ name: 'Źródło', value: 'Admin',  inline: true });
  if (fields.length)  embed.addFields(fields);

  embed
    .setFooter(boFooter(`${char.firstName ?? ''} ${char.lastName ?? ''}  ·  ${char.race ?? ''}`))
    .setTimestamp();
  return embed;
}

// ─── Dropdown ──────────────────────────────────────────────────────────────
function buildSelectMenu(passives, charId) {
  const sorted = sortPassives(passives);
  if (!sorted.length) return null;
  const options = sorted.slice(0, 25).map(p => {
    const statName = p.stat ? (STAT_LABELS[p.stat] ?? p.stat).toUpperCase() : 'ADMIN';
    const desc     = (p.shortDescription || statName || 'Kliknij aby zobaczyć pełny opis').slice(0, 100);
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${p.pinned ? '📌 ' : ''}${p.name}`.slice(0, 100))
      .setValue(`${charId}__${p.id}`)
      .setDescription(desc);
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('passive_select')
      .setPlaceholder('Wybierz efekt → pełny opis z obliczeniami')
      .addOptions(options),
  );
}

// ─── Komenda ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('pasywne')
    .setDescription('Wyświetl efekty pasywne postaci')
    .addUserOption(opt =>
      opt.setName('gracz').setDescription('[ADMIN] Wyświetl efekty innego gracza').setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('gracz');
    if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction))
      return interaction.editReply({ content: '✕  Nie masz uprawnień.' });

    const lookupId = targetUser ? targetUser.id : interaction.user.id;
    const char     = await fetchCharByDiscordId(lookupId);
    if (!char) return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor())
        .setDescription(lookupId === interaction.user.id
          ? '✕  Twoje konto nie jest powiązane z żadną postacią.'
          : `✕  Użytkownik <@${lookupId}> nie ma przypisanej postaci.`)],
    });

    const color    = parseHexColor(char.riatsuColor?.hex);
    const passives = await collectPassives(char);

    const listEmbed = buildListEmbed(char, passives, color);
    const selectRow = buildSelectMenu(passives, char.id);

    if (targetUser && targetUser.id !== interaction.user.id)
      listEmbed.setFooter(boFooter(`Efekty gracza: ${targetUser.username}`));

    const payload = { embeds: [listEmbed] };
    if (selectRow) payload.components = [selectRow];
    return interaction.editReply(payload);
  },

  // ─── Szczegóły po wybraniu z dropdown ────────────────────────────────
  async handleSelect(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [charId, nodeId] = interaction.values[0].split('__');

    const [charDoc, itemsSnap] = await Promise.all([
      db.collection('characters').doc(charId).get(),
      db.collection('characters').doc(charId).collection('items').get(),
    ]);
    if (!charDoc.exists) return interaction.editReply({ content: '✕  Nie znaleziono postaci.' });

    const char     = { id: charDoc.id, ...charDoc.data() };
    const items    = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const { floats: effStats } = calcEffectiveFull(char, items);
    const color    = parseHexColor(char.riatsuColor?.hex);

    // Szukaj danych węzła
    let passive = null;

    // 1. Firestore skillTrees
    try {
      const treesSnap = await db.collection('skillTrees').where('isDefault', '==', true).get();
      for (const doc of treesSnap.docs) {
        const node = (doc.data().nodes ?? []).find(n => n.id === nodeId && n.tags?.includes('passive'));
        if (node) {
          passive = {
            id:   nodeId, source: 'skillTree',
            name: nodeDisplayName(node), stat: doc.data().stat,
            shortDescription: nodeShortDesc(node),
            longDescription:  nodeLongDesc(node),
            tier: node.tier ?? 1,
          };
          break;
        }
      }
    } catch (err) { console.warn('[PASYWNE] Firestore lookup:', err.message); }

    // 2. Fallback JSON
    if (!passive && DEFAULT_PASSIVE_NODES[nodeId]) {
      const n = DEFAULT_PASSIVE_NODES[nodeId];
      passive = { id: nodeId, source: 'skillTree', name: nodeDisplayName(n),
        shortDescription: nodeShortDesc(n), longDescription: nodeLongDesc(n),
        stat: n.stat, tier: n.tier };
    }

    // 3. Admin passiveEffects
    if (!passive) {
      const adminEffect = (char.passiveEffects ?? []).find(e => e?.id === nodeId || `admin_${e?.name}` === nodeId);
      if (adminEffect) {
        passive = { id: nodeId, source: 'admin', name: adminEffect.name,
          shortDescription: '', longDescription: adminEffect.description ?? '',
          stat: null, tier: null };
      }
    }

    // 4. Nazo nodes
    if (!passive && char.nazoUnlocked) {
      const nazoNode = (char.nazoNodes ?? []).find(n => n.id === nodeId);
      if (nazoNode) {
        passive = { id: nodeId, source: 'nazo', stat: 'nazo',
          name: nodeDisplayName(nazoNode),
          shortDescription: nodeShortDesc(nazoNode),
          longDescription:  nodeLongDesc(nazoNode),
          tier: nazoNode.tier };
      }
    }

    if (!passive) {
      console.warn(`[PASYWNE] Nie znaleziono węzła: ${nodeId}`);
      return interaction.editReply({ content: '✕  Nie znaleziono szczegółów efektu.' });
    }

    return interaction.editReply({ embeds: [buildPassiveEmbed(passive, char, effStats, color)] });
  },
};
