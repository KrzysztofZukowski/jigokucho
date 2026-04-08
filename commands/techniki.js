// commands/techniki.js
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags,
} = require('discord.js');
const { db }                                 = require('../firebase');
const { effectivePlain, calcEffectiveFull }  = require('../statCalc');
const { isAdmin }                            = require('../utils');
const { SEP, parseHexColor, boAuthor, boFooter } = require('../design');
const { convertMarkup } = require('../markup');

// ═══════════════ Parser markup (identyczny z techMarkup.js projektu) ═══════
const STAT_ALIASES = {
  strength:'strength',str:'strength', vitality:'vitality',vit:'vitality',
  speed:'speed',spd:'speed', defense:'defense',def:'defense',
  reiatsu:'reiatsu',rei:'reiatsu', reiryoku:'reiryoku',ryo:'reiryoku',
  bujutsu:'bujutsu',buj:'bujutsu',hakuda:'bujutsu',
  bukijutsu:'bukijutsu',buk:'bukijutsu',zanjutsu:'bukijutsu',kyudo:'bukijutsu',
  tamashi:'tamashi',tam:'tamashi', nazo:'nazo',
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



// ═══════════════ Firebase helpers ════════════════════════════════════════════
async function fetchCharByDiscordId(discordId) {
  const linkDoc = await db.collection('discordLinks').doc(discordId).get();
  if (!linkDoc.exists) return null;
  const { identifier } = linkDoc.data();
  const snap = await db.collection('characters').where('identifier', '==', identifier).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ═══════════════ Embeds ═══════════════════════════════════════════════════════
const STAT_LABELS = {
  strength:'Strength', vitality:'Vitality', speed:'Speed', defense:'Defense',
  reiatsu:'Reiatsu', reiryoku:'Reiryoku', bujutsu:'Bujutsu',
  bukijutsu:'Bukijutsu', tamashi:'Tamashi', nazo:'???',
};

function buildListEmbed(char, techniques, color) {
  const name  = `${char.firstName ?? ''} ${char.lastName ?? ''}`.trim();
  const lines = techniques.map((t, i) => {
    const parts = [];
    if (t.classification) parts.push(`CLASS ${t.classification}`);
    if (t.stat)           parts.push((STAT_LABELS[t.stat] ?? t.stat).toUpperCase());
    if (t.origin)         parts.push(t.origin);
    const meta = parts.length ? `  ·  ${parts.join('  ·  ')}` : '';
    return `**${i + 1}.**  ${t.name ?? 'Bez nazwy'}${meta}`;
  });
  return new EmbedBuilder()
    .setAuthor(boAuthor(`TECHNIKI  ·  ${name}`))
    .setColor(color)
    .setDescription(
      lines.length
        ? lines.join('\n').slice(0, 4000) + `\n\n${SEP}\n*Wybierz technikę z menu poniżej.*`
        : '✕  Brak technik.',
    )
    .setFooter(boFooter(`${techniques.length} technik(a)`));
}

function buildTechniqueEmbed(technique, char, color) {
  const stats = char.stats ?? {};
  const embed = new EmbedBuilder()
    .setAuthor(boAuthor(technique.name ?? 'Technika'))
    .setColor(color);

  const meta = [];
  if (technique.classification) meta.push(`\`CLASS ${technique.classification}\``);
  if (technique.stat)           meta.push(`\`${(STAT_LABELS[technique.stat] ?? technique.stat).toUpperCase()}\``);
  if (technique.origin)         meta.push(`\`${technique.origin}\``);

  const descConverted = convertMarkup(technique.description, stats);
  const descBlock = [
    meta.length ? meta.join('  ') : null,
    meta.length && descConverted ? '' : null,
    descConverted || '*Brak opisu.*',
  ].filter(l => l !== null).join('\n');

  embed.setDescription(descBlock.slice(0, 4000));

  if (technique.technicalDetails) {
    const td = convertMarkup(technique.technicalDetails, stats);
    if (td) embed.addFields({ name: 'TECHNICAL DETAILS', value: td.slice(0, 1024) });
  }

  if (technique.imageUrl) embed.setThumbnail(technique.imageUrl);

  embed.setFooter(boFooter(`${char.firstName ?? ''} ${char.lastName ?? ''}  ·  ${char.race ?? ''}`)).setTimestamp();
  return embed;
}

function buildSelectMenu(techniques, charId) {
  if (!techniques.length) return null;
  const options = techniques.slice(0, 25).map(t => {
    const parts = [];
    if (t.classification) parts.push(`CLASS ${t.classification}`);
    if (t.stat)           parts.push(STAT_LABELS[t.stat] ?? t.stat.toUpperCase());
    if (t.origin)         parts.push(t.origin);
    return new StringSelectMenuOptionBuilder()
      .setLabel((t.name ?? 'Bez nazwy').slice(0, 100))
      .setValue(`${charId}__${t.id}`)
      .setDescription((parts.join(' · ') || 'Kliknij aby zobaczyć szczegóły').slice(0, 100));
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('tech_select').setPlaceholder('Wybierz technikę...').addOptions(options),
  );
}

// ═══════════════ Eksport ══════════════════════════════════════════════════════
module.exports = {
  data: new SlashCommandBuilder()
    .setName('techniki')
    .setDescription('Wyświetl listę technik postaci')
    .addUserOption(opt =>
      opt.setName('gracz').setDescription('[ADMIN] Wyświetl techniki innego gracza').setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('gracz');
    if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction))
      return interaction.editReply({ content: '✕  Nie masz uprawnień do przeglądania technik innych graczy.' });

    const lookupId = targetUser ? targetUser.id : interaction.user.id;
    const char     = await fetchCharByDiscordId(lookupId);
    if (!char) return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor())
        .setDescription(lookupId === interaction.user.id
          ? '✕  Twoje konto nie jest powiązane z żadną postacią.'
          : `✕  Użytkownik <@${lookupId}> nie ma przypisanej postaci.`)],
    });

    const color      = parseHexColor(char.riatsuColor?.hex);
    const techSnap   = await db.collection('characters').doc(char.id).collection('techniques').get();
    const techniques = techSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const listEmbed  = buildListEmbed(char, techniques, color);
    const selectRow  = buildSelectMenu(techniques, char.id);
    if (targetUser && targetUser.id !== interaction.user.id)
      listEmbed.setFooter(boFooter(`Techniki gracza: ${targetUser.username}`));

    const payload = { embeds: [listEmbed] };
    if (selectRow) payload.components = [selectRow];
    return interaction.editReply(payload);
  },

  async handleSelect(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [charId, techId] = interaction.values[0].split('__');
    const [techDoc, charDoc, itemsSnap] = await Promise.all([
      db.collection('characters').doc(charId).collection('techniques').doc(techId).get(),
      db.collection('characters').doc(charId).get(),
      db.collection('characters').doc(charId).collection('items').get(),
    ]);
    if (!techDoc.exists || !charDoc.exists)
      return interaction.editReply({ content: '✕  Nie znaleziono techniki lub postaci.' });

    const char   = { id: charDoc.id, ...charDoc.data() };
    const items  = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const { floats: effStats } = calcEffectiveFull(char, items); // floaty z modes
    const color  = parseHexColor(char.riatsuColor?.hex);
    // Nadpisz stats efektywnymi w charze przekazywanym do embeda
    const charWithEff = { ...char, stats: effStats };
    return interaction.editReply({
      embeds: [buildTechniqueEmbed({ id: techDoc.id, ...techDoc.data() }, charWithEff, color)],
    });
  },
};
