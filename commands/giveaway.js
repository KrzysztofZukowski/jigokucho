// commands/giveaway.js
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, MessageFlags,
} = require('discord.js');
const { db }                                          = require('../firebase');
const { isAdmin }                                     = require('../utils');
const { SEP, COLOR, boAuthor, boFooter }              = require('../design');
const { buildGiveawayEmbed, buildJoinButton, scheduleGiveaway, endGiveaway } = require('../giveaways');

// ─── Parsuj czas trwania ──────────────────────────────────────────────────
// Obsługuje: "1h", "30m", "2h30m", "1d", "1d12h", lub plain liczba (= minuty)
function parseDuration(input) {
  const s = input.trim().toLowerCase();
  const d = (s.match(/(\d+)d/) ?? [])[1];
  const h = (s.match(/(\d+)h/) ?? [])[1];
  const m = (s.match(/(\d+)m(?!s)/) ?? [])[1]; // m ale nie ms
  let minutes = 0;
  if (d) minutes += parseInt(d) * 1440;
  if (h) minutes += parseInt(h) * 60;
  if (m) minutes += parseInt(m);
  if (!d && !h && !m) minutes = parseInt(s) || 0;
  return minutes;
}

function formatDuration(minutes) {
  if (minutes >= 1440) return `${Math.floor(minutes/1440)}d ${minutes%1440 ? (Math.floor((minutes%1440)/60) + 'h') : ''}`.trim();
  if (minutes >= 60)   return `${Math.floor(minutes/60)}h ${minutes%60 ? (minutes%60)+'m' : ''}`.trim();
  return `${minutes}m`;
}

// ─── Komenda ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('System giveaway — wymagane konto Black Outpost')
    .addSubcommand(sub => sub
      .setName('stwórz')
      .setDescription('[ADMIN] Stwórz nowy giveaway')
      .addStringOption(o => o.setName('nagroda').setDescription('Co jest do wygrania?').setRequired(true).setMaxLength(200))
      .addStringOption(o => o.setName('czas').setDescription('Czas trwania: 1h, 30m, 2h30m, 1d (wymagane)').setRequired(true).setMaxLength(20))
      .addChannelOption(o => o.setName('kanał').setDescription('Kanał giveawaya').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption(o => o.setName('zwycięzcy').setDescription('Liczba zwycięzców (domyślnie 1)').setMinValue(1).setMaxValue(20).setRequired(false))
      .addStringOption(o => o.setName('opis').setDescription('Opis giveawaya (opcjonalne)').setRequired(false).setMaxLength(500))
      .addStringOption(o => o.setName('wymaganie').setDescription('Opcjonalne wymagania uczestnictwa (tekst)').setRequired(false).setMaxLength(200))
    )
    .addSubcommand(sub => sub.setName('lista').setDescription('[ADMIN] Lista aktywnych giveawayów'))
    .addSubcommand(sub => sub.setName('zakończ').setDescription('[ADMIN] Zakończ giveaway przed czasem'))
    .addSubcommand(sub => sub.setName('reroll').setDescription('[ADMIN] Ponownie wylosuj zwycięzcę')),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą zarządzać giveawayami.', flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    // ── /giveaway stwórz ──────────────────────────────────────────────────
    if (sub === 'stwórz') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const prize        = interaction.options.getString('nagroda').trim();
      const durationRaw  = interaction.options.getString('czas');
      const channel      = interaction.options.getChannel('kanał');
      const winnersCount = interaction.options.getInteger('zwycięzcy') ?? 1;
      const requirement  = interaction.options.getString('wymaganie');
      const opis          = interaction.options.getString('opis');

      const durationMin = parseDuration(durationRaw);
      if (durationMin < 1) return interaction.editReply({ content: '✕  Nieprawidłowy czas. Przykłady: `1h`, `30m`, `2h30m`, `1d`.' });

      const endsAt = new Date(Date.now() + durationMin * 60_000).toISOString();

      // Zapisz wstępnie do Firestore
      const ref = await db.collection('giveaways').add({
        prize, endsAt, winnersCount,
        channelId:  channel.id,
        guildId:    interaction.guild.id,
        messageId:  null,
        active:     true,
        requirement: requirement ?? null,
        winners:    [],
        opis:        opis ?? null,
        createdBy:  interaction.user.id,
        createdAt:  new Date().toISOString(),
      });

      // Wyślij embed giveawaya na kanał
      const giveaway = { id: ref.id, prize, endsAt, winnersCount, channelId: channel.id, requirement, opis };
      const embed    = buildGiveawayEmbed(giveaway, 0, false);
      const row      = buildJoinButton(ref.id, 0);

      const targetCh = interaction.client.channels.cache.get(channel.id)
                    ?? await interaction.client.channels.fetch(channel.id);
      const msg = await targetCh.send({ embeds: [embed], components: [row] });

      // Zapisz messageId
      await db.collection('giveaways').doc(ref.id).update({ messageId: msg.id });

      // Zaplanuj zakończenie
      scheduleGiveaway(interaction.client, { ...giveaway, id: ref.id, messageId: msg.id });

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.RED).setAuthor(boAuthor('GIVEAWAY STWORZONY'))
          .addFields(
            { name: 'Nagroda',       value: prize,                       inline: true },
            { name: 'Czas',          value: formatDuration(durationMin), inline: true },
            { name: 'Zwycięzcy',     value: String(winnersCount),         inline: true },
            { name: 'Kanał',         value: `<#${channel.id}>`,           inline: true },
          ).setFooter(boFooter()).setTimestamp()],
      });
    }

    // ── /giveaway lista ───────────────────────────────────────────────────
    if (sub === 'lista') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const snap     = await db.collection('giveaways').where('active', '==', true).get();
      const giveaways = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (!giveaways.length) return interaction.editReply({ content: 'Brak aktywnych giveawayów.' });

      const lines = await Promise.all(giveaways.map(async g => {
        const partCount = (await db.collection('giveaways').doc(g.id).collection('participants').get()).size;
        const endsTs    = Math.floor(new Date(g.endsAt).getTime() / 1000);
        return `**${g.prize}**  ·  ${partCount} uczestników  ·  koniec <t:${endsTs}:R>\nKanał: <#${g.channelId}>`;
      }));

      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('AKTYWNE GIVEAWAY\'E')).setColor(COLOR.RED)
          .setDescription(lines.join(`\n${SEP}\n`)).setFooter(boFooter(`${giveaways.length} giveaway(ów)`))],
      });
    }

    // ── /giveaway zakończ ─────────────────────────────────────────────────
    if (sub === 'zakończ') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const snap     = await db.collection('giveaways').where('active', '==', true).get();
      const giveaways = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!giveaways.length) return interaction.editReply({ content: 'Brak aktywnych giveawayów.' });

      const options = giveaways.slice(0, 25).map(g =>
        new StringSelectMenuOptionBuilder().setLabel(g.prize.slice(0, 100)).setValue(g.id)
          .setDescription(`Kanał <#${g.channelId}>`.slice(0, 100))
      );
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.RED).setAuthor(boAuthor('ZAKOŃCZ GIVEAWAY'))
          .setDescription('Wybierz giveaway do natychmiastowego zakończenia.')],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('giveaway_end_select').setPlaceholder('Wybierz giveaway...').addOptions(options)
        )],
      });
    }

    // ── /giveaway reroll ──────────────────────────────────────────────────
    if (sub === 'reroll') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      // Nie używamy orderBy (wymagałoby indeksu Firestore) — sortujemy w JS
      const snap     = await db.collection('giveaways').where('active', '==', false).limit(30).get();
      const giveaways = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(g => g.endedAt)
        .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
        .slice(0, 10);
      if (!giveaways.length) return interaction.editReply({ content: 'Brak zakończonych giveawayów do rerollu.' });

      const options = giveaways.slice(0, 25).map(g =>
        new StringSelectMenuOptionBuilder().setLabel(g.prize.slice(0, 100)).setValue(g.id)
          .setDescription(`Zakończony: ${(g.endedAt ?? '').slice(0, 10)}`.slice(0, 100))
      );
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.RED).setAuthor(boAuthor('REROLL GIVEAWAY'))
          .setDescription('Wybierz giveaway do ponownego losowania.')],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('giveaway_reroll_select').setPlaceholder('Wybierz giveaway...').addOptions(options)
        )],
      });
    }
  },

  // ─── Przycisk: Dołącz / Opuść ────────────────────────────────────────
  async handleJoinButton(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const giveawayId = interaction.customId.split('__')[1];
    const gDoc       = await db.collection('giveaways').doc(giveawayId).get();
    if (!gDoc.exists || !gDoc.data().active)
      return interaction.editReply({ content: '✕  Ten giveaway już się zakończył.' });

    // Sprawdź czy gracz ma login
    const linkDoc = await db.collection('discordLinks').doc(interaction.user.id).get();
    if (!linkDoc.exists) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor('GIVEAWAY'))
          .setDescription('✕  Aby dołączyć do giveawaya, musisz mieć przypisane konto Black Outpost.\nSkontaktuj się z administratorem.')],
      });
    }

    const partRef  = db.collection('giveaways').doc(giveawayId).collection('participants').doc(interaction.user.id);
    const partDoc  = await partRef.get();
    const giveaway = { id: giveawayId, ...gDoc.data() };

    if (partDoc.exists) {
      // Opuść giveaway
      await partRef.delete();
      const newCount = (await db.collection('giveaways').doc(giveawayId).collection('participants').get()).size;

      // Zaktualizuj przycisk
      const channel = interaction.client.channels.cache.get(giveaway.channelId);
      if (channel) {
        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) await msg.edit({ components: [buildJoinButton(giveawayId, newCount)] });
      }

      return interaction.editReply({ content: '✓  Opuściłeś giveaway.' });
    } else {
      // Dołącz
      await partRef.set({
        joinedAt:   new Date().toISOString(),
        identifier: linkDoc.data()?.identifier ?? null,
      });
      const newCount = (await db.collection('giveaways').doc(giveawayId).collection('participants').get()).size;

      // Zaktualizuj przycisk
      const channel = interaction.client.channels.cache.get(giveaway.channelId);
      if (channel) {
        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) await msg.edit({ components: [buildJoinButton(giveawayId, newCount)] });
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.RED).setAuthor(boAuthor('GIVEAWAY'))
          .setDescription(`✓  Dołączyłeś do giveawaya **${giveaway.prize}**!\nAby opuścić, kliknij przycisk ponownie.`)],
      });
    }
  },

  // ─── Select: zakończ ────────────────────────────────────────────────────
  async handleEndSelect(interaction) {
    const giveawayId = interaction.values[0];
    await interaction.update({ content: `Kończę giveaway...`, components: [], embeds: [] });
    await endGiveaway(interaction.client, giveawayId);
    await interaction.editReply({ content: '✓  Giveaway zakończony.' });
  },

  // ─── Select: reroll ─────────────────────────────────────────────────────
  async handleRerollSelect(interaction) {
    await interaction.deferUpdate();
    const giveawayId = interaction.values[0];
    const gDoc       = await db.collection('giveaways').doc(giveawayId).get();
    if (!gDoc.exists) return interaction.editReply({ content: '✕  Nie znaleziono giveawaya.' });

    const giveaway = { id: giveawayId, ...gDoc.data() };
    const partSnap = await db.collection('giveaways').doc(giveawayId).collection('participants').get();
    const pool     = partSnap.docs.map(d => d.id);

    if (!pool.length) return interaction.editReply({ content: '✕  Brak uczestników do losowania.' });

    const winnersCount = giveaway.winnersCount ?? 1;
    const newWinners   = [];
    const poolCopy     = [...pool];
    while (newWinners.length < winnersCount && poolCopy.length > 0) {
      newWinners.push(poolCopy.splice(Math.floor(Math.random() * poolCopy.length), 1)[0]);
    }

    await db.collection('giveaways').doc(giveawayId).update({ winners: newWinners });

    const channel = interaction.client.channels.cache.get(giveaway.channelId);
    if (channel) {
      const winnersStr = newWinners.map(id => `<@${id}>`).join(', ');
      await channel.send({
        content: `✦  **Reroll!** Nowi zwycięzcy: ${winnersStr} — Nagroda: **${giveaway.prize}**`,
      });
    }

    return interaction.editReply({ content: `✓  Reroll zakończony. Nowi zwycięzcy: ${newWinners.map(id => `<@${id}>`).join(', ')}`, components: [] });
  },
};
