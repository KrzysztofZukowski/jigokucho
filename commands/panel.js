// commands/panel.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { db }                   = require('../firebase');
const { SEP, raceSymbol, parseHexColor, fmt, progressBar, boAuthor, boFooter } = require('../design');
const { getStatName, isAdmin, calcNDRFromReisen, getReisenProgress, calcSpentNDR, countNodesForStat } = require('../utils');
const { calcEffectiveFull }    = require('../statCalc');

async function getIdentifierForDiscordId(discordId) {
  const doc = await db.collection('discordLinks').doc(discordId).get();
  return doc.exists ? doc.data()?.identifier : null;
}

function statLine(label, data, nodes) {
  const { base, display, hasBonus } = data;
  const nodeStr = nodes > 0 ? `  ‹${nodes}›` : '';
  const valStr  = hasBonus
    ? `**${fmt(display)}** *(${fmt(base)})*`
    : `**${fmt(display)}**`;
  return `\`${String(label).slice(0, 18).padEnd(18)}\`  ${valStr}${nodeStr}`;
}

// ─── Embed 1 — Profil ─────────────────────────────────────────────────────
function buildProfileEmbed(char, color) {
  const race  = char.race ?? 'Unknown';
  const lines = [
    char.nickname || char.alias || char.codename
      ? `**"${char.nickname ?? char.alias ?? char.codename}"**\n` : '',
    `\`Rasa          \`  ${raceSymbol(race)}  ${race}`,
    `\`Ranga         \`  ${char.rank ?? 'I'}  ·  ${char.position ?? '—'}`,
    `\`Security      \`  SLV ${char.slv ?? 'I'}  /  SCA ${char.sca ?? 'I'}`,
    char.riatsuColor?.hex
      ? `\`Reiatsu Color \`  ${char.riatsuColor?.name ?? '—'}  ·  \`${char.riatsuColor.hex}\`` : '',
  ].filter(Boolean);

  return new EmbedBuilder()
    .setAuthor(boAuthor('KARTA POSTACI'))
    .setColor(color)
    .setTitle(`${raceSymbol(race)}  ${char.firstName ?? ''} ${char.lastName ?? ''}`)
    .setDescription(lines.join('\n'))
    .setThumbnail(char.photoUrl ?? null);
}

// ─── Embed 2 — Statystyki ─────────────────────────────────────────────────
function buildStatsEmbed(char, items, color) {
  const race          = char.race ?? 'Unknown';
  const unlockedNodes = char.unlockedNodes ?? {};

  const { stats: eff, hp, rp, activeModes } = calcEffectiveFull(char, items);

  const statsDefs = [
    ['strength',  'Strength'],
    ['vitality',  'Vitality'],
    ['speed',     'Speed'],
    ['defense',   'Defense'],
    ['reiatsu',   'Reiatsu'],
    ['reiryoku',  'Reiryoku'],
    ['bujutsu',   getStatName('bujutsu',   race)],
    ['bukijutsu', getStatName('bukijutsu', race)],
    ['tamashi',   getStatName('tamashi',   race)],
  ];

  const statLines = statsDefs.map(([key, label]) =>
    statLine(label, eff[key] ?? { base: 0, display: 0, hasBonus: false },
             countNodesForStat(unlockedNodes, key))
  );

  if (char.nazoUnlocked) {
    const nazoData = eff['nazo'] ?? { base: 0, display: 0, hasBonus: false };
    statLines.push(statLine(char.nazoName ?? '???', nazoData, countNodesForStat(unlockedNodes, 'nazo')));
  } else {
    statLines.push(`\`${'???'.padEnd(18)}\`  ✕`);
  }

  // HP i RP
  statLines.push('');
  statLines.push(`\`${'Max HP'.padEnd(18)}\`  **${fmt(hp)}**`);
  statLines.push(`\`${'Max RP'.padEnd(18)}\`  **${fmt(rp)}**`);

  // Aktywne mode'y
  if (activeModes.length) {
    statLines.push('');
    for (const mode of activeModes) {
      const mults = (mode.multipliers ?? [])
        .map(m => `${m.stat} ×${m.factor}`)
        .join(', ');
      statLines.push(`🔴 **${mode.name}** ${mults ? `*(${mults})*` : ''}`);
    }
  }

  // NDR
  const reisenAbsorbed = char.reisenAbsorbed ?? 0;
  const adminBonus     = char.ndr ?? 0;
  const ndrFromReisen  = calcNDRFromReisen(reisenAbsorbed);
  const totalNDR       = ndrFromReisen + adminBonus;
  const spentNDR       = calcSpentNDR(unlockedNodes);
  const { current: rCur, nextCost: rNext } = getReisenProgress(reisenAbsorbed);

  const ndrLines = [
    `\`${progressBar(rCur, rNext, 16)}\`  ${rCur}/${rNext}`,
    SEP,
    `\`Łącznie       \`  ${totalNDR}`,
    `\`Wydane        \`  ${spentNDR}`,
    `\`Dostępne      \`  **${totalNDR - spentNDR}**`,
    '',
    `\`PDR dostępne  \`  **${fmt(char.pdr ?? 0)}**`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setAuthor(boAuthor('DANE BOJOWE'))
    .setColor(color)
    .addFields(
      { name: 'STATS', value: statLines.join('\n').slice(0, 1024), inline: true },
      { name: 'NODE POINTS  ·  PDR', value: ndrLines, inline: true },
      { name: '\u200b', value: SEP, inline: false },
      { name: 'YEN',           value: fmt(char.yen     ?? 0), inline: true },
      { name: 'LOYALTY',       value: fmt(char.loyalty ?? 0), inline: true },
      { name: '\u200b',        value: '\u200b',               inline: true },
      { name: `REISEN ${SEP}`, value: '\u200b',               inline: false },
      { name: 'Przy sobie',    value: fmt(char.reisenHand    ?? 0), inline: true },
      { name: 'Wchłonięte',    value: fmt(reisenAbsorbed),          inline: true },
      { name: 'W banku',       value: fmt(char.reisenBanked  ?? 0), inline: true },
    )
    .setFooter(boFooter())
    .setTimestamp();

  return embed;
}

// ─── Komenda ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Wyświetl kartę postaci z Black Outpost')
    .addUserOption(opt =>
      opt.setName('gracz').setDescription('[ADMIN] Wyświetl kartę innego gracza').setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('gracz');
    if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction))
      return interaction.editReply({ content: '✕  Możesz wyświetlić tylko swój własny panel.' });

    const lookupId   = targetUser ? targetUser.id : interaction.user.id;
    const identifier = await getIdentifierForDiscordId(lookupId);
    if (!identifier) return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor())
        .setDescription(lookupId === interaction.user.id
          ? '✕  Twoje konto nie jest powiązane z żadną postacią.'
          : `✕  Użytkownik <@${lookupId}> nie ma przypisanego identyfikatora.`)],
    });

    const snap = await db.collection('characters').where('identifier', '==', identifier).limit(1).get();
    if (snap.empty) return interaction.editReply({ content: `✕  Nie znaleziono karty dla \`${identifier}\`.` });

    const char  = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const color = parseHexColor(char.riatsuColor?.hex);

    const itemsSnap = await db.collection('characters').doc(char.id).collection('items').get();
    const items     = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const embed1 = buildProfileEmbed(char, color);
    const embed2 = buildStatsEmbed(char, items, color);
    if (targetUser && targetUser.id !== interaction.user.id)
      embed2.setFooter(boFooter(`Karta gracza: ${targetUser.username}`));

    return interaction.editReply({ embeds: [embed1, embed2] });
  },
};
