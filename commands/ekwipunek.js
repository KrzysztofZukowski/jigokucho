// commands/ekwipunek.js
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags,
} = require('discord.js');
const { db }                                      = require('../firebase');
const { isAdmin }                                 = require('../utils');
const { SEP, parseHexColor, fmt, boAuthor, boFooter } = require('../design');
const { convertMarkup }                           = require('../markup');
const { effectivePlain, calcEffectiveFull }       = require('../statCalc');

async function fetchCharByDiscordId(discordId) {
  const linkDoc = await db.collection('discordLinks').doc(discordId).get();
  if (!linkDoc.exists) return null;
  const { identifier } = linkDoc.data();
  const snap = await db.collection('characters').where('identifier', '==', identifier).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function fetchEquipmentTypes() {
  const snap = await db.collection('equipmentTypes').get();
  const map  = {};
  snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
  return map;
}

function formatBonuses(statBonuses) {
  if (!Array.isArray(statBonuses)) return '';
  return statBonuses
    .filter(b => b.flat || b.percent)
    .map(b => {
      const parts = [];
      if (b.flat)    parts.push(`${b.flat > 0 ? '+' : ''}${b.flat} ${b.stat}`);
      if (b.percent) parts.push(`${b.percent > 0 ? '+' : ''}${b.percent}% ${b.stat}`);
      return parts.join(', ');
    })
    .filter(Boolean)
    .join('  ·  ');
}

// ─── Embed listy ekwipunku ────────────────────────────────────────────────
function buildEquipmentEmbed(char, items, equipmentTypes, color) {
  const name     = `${char.firstName ?? ''} ${char.lastName ?? ''}`.trim();
  const equipped = items.filter(i => i.itemType === 'equipment' && i.equipped === true);
  const unequip  = items.filter(i => i.itemType === 'equipment' && !i.equipped);
  const inv      = items.filter(i => i.itemType !== 'equipment');

  function itemLine(item) {
    const typeName = equipmentTypes[item.equipmentTypeId]?.name ?? '';
    const bonuses  = formatBonuses(item.statBonuses);
    const typeStr  = typeName ? `  *(${typeName})*` : '';
    const bonusStr = bonuses  ? `\n   \`${bonuses}\`` : '';
    return `**${item.name}**${typeStr}${bonusStr}`;
  }

  const fields = [
    { name: 'ZAŁOŻONY EKWIPUNEK', value: (equipped.length ? equipped.map(itemLine).join('\n') : '*brak*').slice(0, 1024), inline: true },
    { name: `INWENTARZ  (${inv.length})`,   value: (inv.length ? inv.map(i => `${i.name}${(i.quantity ?? 1) > 1 ? ` ×${i.quantity}` : ''}`).join('\n') : '*brak*').slice(0, 1024), inline: true },
  ];

  if (unequip.length) {
    fields.push({ name: '\u200b', value: SEP, inline: false });
    fields.push({ name: 'W PLECAKU', value: unequip.map(i => `${i.name} *(${equipmentTypes[i.equipmentTypeId]?.name ?? 'eq'})*`).join('\n').slice(0, 1024), inline: false });
  }

  return new EmbedBuilder()
    .setAuthor(boAuthor(`EKWIPUNEK  ·  ${name}`))
    .setColor(color)
    .addFields(fields)
    .setFooter(boFooter(`${items.length} przedmiotów łącznie`))
    .setTimestamp();
}

// ─── Embed szczegółów itemu — ze skalowaniem od statystyk gracza ──────────
function buildItemEmbed(item, equipmentTypes, color, charStats, charRace) {
  const typeName = equipmentTypes[item.equipmentTypeId]?.name ?? item.itemType ?? '—';
  const bonuses  = formatBonuses(item.statBonuses);

  // Opis i notatki z obliczonymi formułami (na podstawie statystyk postaci)
  const descParsed  = convertMarkup(item.description, charStats ?? {});
  const notesParsed = item.notes ? convertMarkup(item.notes, charStats ?? {}) : null;

  const embed = new EmbedBuilder()
    .setAuthor(boAuthor(item.name ?? 'Przedmiot'))
    .setColor(color)
    .setDescription(descParsed || '*Brak opisu.*')
    .addFields(
      { name: 'Typ',    value: typeName,                                 inline: true },
      { name: 'Status', value: item.equipped ? 'Założony' : 'W plecaku', inline: true },
    );

  if ((item.quantity ?? 1) > 1)
    embed.addFields({ name: 'Ilość', value: String(item.quantity), inline: true });
  if (bonuses)
    embed.addFields({ name: 'BONUSY STATYSTYK', value: `\`${bonuses}\``, inline: false });
  if (notesParsed)
    embed.addFields({ name: 'NOTATKI', value: notesParsed, inline: false });
  if (item.requirements)
    embed.addFields({ name: 'WYMAGANIA', value: String(item.requirements), inline: false });
  if (item.imageUrl)
    embed.setThumbnail(item.imageUrl);

  embed.setFooter(boFooter()).setTimestamp();
  return embed;
}

// ─── Dropdown ─────────────────────────────────────────────────────────────
function buildItemSelectMenu(items, charId) {
  if (!items.length) return null;
  const options = items.slice(0, 25).map(item => {
    const status = item.itemType === 'equipment' ? (item.equipped ? ' [założony]' : ' [plecak]') : '';
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${item.name ?? 'Bez nazwy'}${status}`.slice(0, 100))
      .setValue(`${charId}__${item.id}`)
      .setDescription((item.description ?? 'Kliknij aby zobaczyć szczegóły').slice(0, 100));
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('item_select').setPlaceholder('Wybierz przedmiot...').addOptions(options),
  );
}

// ─── Komenda ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ekwipunek')
    .setDescription('Wyświetl ekwipunek postaci')
    .addUserOption(opt =>
      opt.setName('gracz').setDescription('[ADMIN] Wyświetl ekwipunek innego gracza').setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser = interaction.options.getUser('gracz');
    if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction))
      return interaction.editReply({ content: '✕  Nie masz uprawnień do przeglądania ekwipunku innych graczy.' });

    const lookupId = targetUser ? targetUser.id : interaction.user.id;
    const char     = await fetchCharByDiscordId(lookupId);
    if (!char) return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor())
        .setDescription(lookupId === interaction.user.id
          ? '✕  Twoje konto nie jest powiązane z żadną postacią.'
          : `✕  Użytkownik <@${lookupId}> nie ma przypisanej postaci.`)],
    });

    const [itemsSnap, equipmentTypes] = await Promise.all([
      db.collection('characters').doc(char.id).collection('items').get(),
      fetchEquipmentTypes(),
    ]);
    const items  = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const color  = parseHexColor(char.riatsuColor?.hex);
    const embed  = buildEquipmentEmbed(char, items, equipmentTypes, color);
    const select = buildItemSelectMenu(items, char.id);
    if (targetUser && targetUser.id !== interaction.user.id)
      embed.setFooter(boFooter(`Ekwipunek gracza: ${targetUser.username}`));

    const payload = { embeds: [embed] };
    if (select) payload.components = [select];
    return interaction.editReply(payload);
  },

  async handleSelect(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [charId, itemId] = interaction.values[0].split('__');

    const [itemDoc, charDoc] = await Promise.all([
      db.collection('characters').doc(charId).collection('items').doc(itemId).get(),
      db.collection('characters').doc(charId).get(),
    ]);
    if (!itemDoc.exists) return interaction.editReply({ content: '✕  Nie znaleziono przedmiotu.' });

    const char           = charDoc.exists ? { id: charDoc.id, ...charDoc.data() } : {};
    const color          = parseHexColor(char.riatsuColor?.hex);
    const equipmentTypes = await fetchEquipmentTypes();
    const item           = { id: itemDoc.id, ...itemDoc.data() };

    // Oblicz efektywne staty i przekaż do parsera formuł
    const allItemsSnap = await db.collection('characters').doc(charId).collection('items').get();
    const allItems     = allItemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const { floats: effStats } = calcEffectiveFull(char, allItems);
    return interaction.editReply({
      embeds: [buildItemEmbed(item, equipmentTypes, color, effStats, char.race)],
    });
  },
};
