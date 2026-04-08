// commands/events.js — admin: ręczne wywołanie eventów + zarządzanie quiz
const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
} = require('discord.js');
const { db }      = require('../firebase');
const { isAdmin } = require('../utils');
const { COLOR, boAuthor, boFooter } = require('../design');

const GENERAL_CH_ID = '1408447648767414476';

// ─── Lazy-load funEvents (unika circular require) ─────────────────────────
function getFunEvents() { return require('../events/funEvents'); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('[ADMIN] Zarządzaj eventami i bazą quizów')

    // Ręczne wywołanie eventu
    .addSubcommand(sub => sub
      .setName('trigger')
      .setDescription('[ADMIN] Wywołaj event ręcznie')
      .addStringOption(o => o.setName('typ').setDescription('Typ eventu').setRequired(true)
        .addChoices(
          { name: '⚡ Kto pierwszy',     value: 'first'  },
          { name: '🖼️ Quiz — postać',    value: 'image'  },
          { name: '🧩 Zagadka',          value: 'riddle' },
        )
      )
      .addBooleanOption(o => o.setName('bypass').setDescription('Pomiń cooldown? (true = ignoruj limity, false = zlicz normalnie)').setRequired(true))
    )

    // Dodaj zdjęcie do quizu
    .addSubcommand(sub => sub
      .setName('quiz-add')
      .setDescription('[ADMIN] Dodaj zdjęcie postaci do quizu')
      .addStringOption(o => o.setName('url').setDescription('URL zdjęcia').setRequired(true))
      .addStringOption(o => o.setName('nazwy').setDescription('Imię i nazwisko rozdzielone spacją (np. "Kisuke Urahara")').setRequired(true))
    )

    // Lista zdjęć
    .addSubcommand(sub => sub
      .setName('quiz-list')
      .setDescription('[ADMIN] Lista zdjęć w bazie quizu')
    )

    // Usuń zdjęcie
    .addSubcommand(sub => sub
      .setName('quiz-remove')
      .setDescription('[ADMIN] Usuń zdjęcie z bazy quizu')
      .addStringOption(o => o.setName('id').setDescription('ID dokumentu (z quiz-list)').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy.', flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    // ── /events trigger ────────────────────────────────────────────────────
    if (sub === 'trigger') {
      const typ    = interaction.options.getString('typ');
      const bypass = interaction.options.getBoolean('bypass');

      // Natychmiastowa ephemeral odpowiedź — inni nie widzą
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.RED)
          .setAuthor(boAuthor('EVENT — RĘCZNE WYWOŁANIE'))
          .setDescription(`Wywołuję event **${typ}** (bypass: ${bypass ? 'tak' : 'nie'})...`)],
        flags: MessageFlags.Ephemeral,
      });

      // Pobierz kanał ogólny
      const channel = interaction.client.channels.cache.get(GENERAL_CH_ID)
                   ?? await interaction.client.channels.fetch(GENERAL_CH_ID).catch(() => null);

      if (!channel) {
        return interaction.editReply({ content: '✕  Nie znaleziono kanału ogólnego.' });
      }

      const fe  = getFunEvents();
      let ok    = false;
      let error = null;

      try {
        if (typ === 'first')  ok = await fe.triggerEvent1(channel, bypass);
        if (typ === 'image')  ok = await fe.triggerEvent2(channel, bypass);
        if (typ === 'riddle') ok = await fe.triggerEvent3(channel, bypass);
      } catch (err) {
        error = err.message;
        console.error('[EVENTS] Błąd ręcznego wywołania:', err);
      }

      if (error) {
        return interaction.editReply({ content: `✕  Błąd: ${error}` });
      }

      if (!ok) {
        // Pobierz powód
        const { data } = await fe.getDailyState();
        let reason = 'Nieznany powód.';
        if (typ === 'first') {
          if (data.event1Count >= 3) reason = 'Osiągnięto limit 3 eventów "kto pierwszy" dzisiaj.';
          else reason = 'Cooldown jeszcze aktywny lub inny event jest aktywny.';
        } else {
          if (data.event23Done) reason = 'Dzienny event (quiz/zagadka) już się odbył.';
          else if (typ === 'image') reason = 'Brak zdjęć w bazie lub inny event jest aktywny.';
          else reason = 'Inny event jest aktywny.';
        }
        return interaction.editReply({ content: `✕  Event nie mógł zostać uruchomiony: ${reason}` });
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.RED)
          .setAuthor(boAuthor('EVENT — URUCHOMIONY'))
          .setDescription(`Event **${typ}** wysłany na <#${GENERAL_CH_ID}>.\nBypass cooldownu: ${bypass ? '**tak**' : '**nie** (zliczono normalnie)'}`)
          .setFooter(boFooter())
          .setTimestamp()],
      });
    }

    // ── /events quiz-add ───────────────────────────────────────────────────
    if (sub === 'quiz-add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const url    = interaction.options.getString('url').trim();
      const names  = interaction.options.getString('nazwy').trim();

      // Podziel po spacjach i zamień na lowercase — każdy segment jest akceptowaną odpowiedzią
      const nameArr = names.toLowerCase().split(/\s+/).filter(Boolean);

      // Walidacja URL
      try { new URL(url); } catch {
        return interaction.editReply({ content: '✕  Nieprawidłowy URL zdjęcia.' });
      }

      const ref = await db.collection('quizImages').add({
        url,
        names:     nameArr,
        addedBy:   interaction.user.id,
        addedAt:   new Date().toISOString(),
        // Oryginalna forma dla wyświetlania
        displayName: names,
      });

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.RED)
          .setAuthor(boAuthor('QUIZ — ZDJĘCIE DODANE'))
          .addFields(
            { name: 'ID',           value: `\`${ref.id}\``,           inline: true },
            { name: 'Nazwy',        value: nameArr.map(n => `\`${n}\``).join(', '), inline: false },
            { name: 'URL (podgląd)', value: url.slice(0, 100),         inline: false },
          )
          .setThumbnail(url)
          .setFooter(boFooter())
          .setTimestamp()],
      });
    }

    // ── /events quiz-list ──────────────────────────────────────────────────
    if (sub === 'quiz-list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const snap  = await db.collection('quizImages').orderBy('addedAt', 'desc').limit(25).get();

      if (snap.empty) {
        return interaction.editReply({ content: '✕  Baza quizów jest pusta. Dodaj zdjęcia przez `/events quiz-add`.' });
      }

      const lines = snap.docs.map((doc, i) => {
        const d = doc.data();
        return `**${i+1}.** \`${doc.id}\`  ·  **${d.displayName ?? d.names?.join(' ')}**\n   ${(d.url ?? '').slice(0, 60)}`;
      });

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setAuthor(boAuthor('QUIZ — LISTA ZDJĘĆ'))
          .setColor(COLOR.RED)
          .setDescription(lines.join('\n\n').slice(0, 4000))
          .setFooter(boFooter(`${snap.size} pozycji`))],
      });
    }

    // ── /events quiz-remove ────────────────────────────────────────────────
    if (sub === 'quiz-remove') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id  = interaction.options.getString('id').trim();
      const doc = await db.collection('quizImages').doc(id).get();

      if (!doc.exists) {
        return interaction.editReply({ content: `✕  Nie znaleziono zdjęcia o ID \`${id}\`.` });
      }

      const { displayName, names } = doc.data();
      await db.collection('quizImages').doc(id).delete();

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2e2e3f)
          .setAuthor(boAuthor('QUIZ — ZDJĘCIE USUNIĘTE'))
          .setDescription(`\`${displayName ?? names?.join(' ')}\` (ID: \`${id}\`) usunięte z bazy.`)
          .setTimestamp()],
      });
    }
  },
};
