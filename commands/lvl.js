// commands/lvl.js — system poziomów, ranking, zarządzanie tokenami
const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
} = require('discord.js');
const { db }                                     = require('../firebase');
const { isAdmin, getUserColor }                  = require('../utils');
const { SEP, COLOR, progressBar, fmt, boAuthor, boFooter } = require('../design');

// ─── Formuła XP ───────────────────────────────────────────────────────────
// XP potrzebne do przejścia z poziomu N na N+1
// Rośnie wykładniczo — wyższe poziomy trudniejsze
function xpNeededForLevel(level) {
  return Math.floor(150 * Math.pow(level, 1.65));
}

// Tokeny za poziom
function tokensForLevel(level) {
  if (level % 5 === 0) return 3; // co 5. poziom: 3 tokeny
  if (level % 2 === 0) return 1; // co 2. poziom: 1 token
  return 0;
}

// Pobierz lub zainicjuj dokument poziomu
async function getLevelDoc(userId) {
  const ref = db.collection('levels').doc(userId);
  const doc = await ref.get();
  if (doc.exists) return { ref, data: doc.data() };
  // Inicjalizuj nowy dokument
  const defaults = { userId, level: 0, xp: 0, totalXp: 0, tokens: 0, lastMessageAt: null };
  await ref.set(defaults);
  return { ref, data: defaults };
}

// ─── Embed poziomu ────────────────────────────────────────────────────────
function buildLvlEmbed(user, data, color = 0xdc3232) {
  const level    = data.level ?? 0;
  const xp       = data.xp   ?? 0;
  const needed   = xpNeededForLevel(level + 1);
  const tokens   = data.tokens ?? 0;
  const totalXp  = data.totalXp ?? 0;
  const bar      = progressBar(xp, needed, 14);

  return new EmbedBuilder()
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setColor(color)
    .setTitle(`Poziom ${level}`)
    .addFields(
      {
        name:   'POSTĘP DO NASTĘPNEGO POZIOMU',
        value:  `\`${bar}\`  ${fmt(xp)} / ${fmt(needed)} XP`,
        inline: false,
      },
      { name: 'Łączne XP',  value: fmt(totalXp),          inline: true },
      { name: 'Tokeny',     value: `**${fmt(tokens)}**`,   inline: true },
    )
    .setFooter(boFooter())
    .setTimestamp();
}

// ─── Embed rankingu ───────────────────────────────────────────────────────
async function buildRankingEmbed(client, entries, title, highlightId = null) {
  const lines = await Promise.all(entries.map(async ({ rank, data }) => {
    let username = `<@${data.userId}>`;
    try {
      const user = await client.users.fetch(data.userId);
      username = user.username;
    } catch (_) {}
    const isHighlight = data.userId === highlightId;
    const prefix      = isHighlight ? '**→** ' : '      ';
    return `${prefix}**#${rank}**  ${username}  ·  Poziom **${data.level ?? 0}**  ·  ${fmt(data.xp ?? 0)} XP`;
  }));

  return new EmbedBuilder()
    .setAuthor(boAuthor('RANKING'))
    .setColor(COLOR.RED)
    .setTitle(title)
    .setDescription(lines.join('\n') || '*Brak danych*')
    .setFooter(boFooter())
    .setTimestamp();
}

// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  data: new SlashCommandBuilder()
    .setName('lvl')
    .setDescription('System poziomów')
    .addSubcommand(sub => sub
      .setName('check')
      .setDescription('Sprawdź swój poziom i tokeny')
      .addUserOption(o => o.setName('gracz').setDescription('[ADMIN] Sprawdź poziom innego gracza').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('ranking')
      .setDescription('TOP 10 serwera')
      .addBooleanOption(o => o.setName('nearby').setDescription('Pokaż graczy w okolicach twojego poziomu').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('tokenset')
      .setDescription('[ADMIN] Zarządzaj tokenami gracza')
      .addUserOption(o  => o.setName('gracz').setDescription('Użytkownik').setRequired(true))
      .addStringOption(o => o.setName('akcja').setDescription('Akcja').setRequired(true)
        .addChoices(
          { name: 'Dodaj',    value: 'add'      },
          { name: 'Odejmij',  value: 'subtract'  },
          { name: 'Ustaw na', value: 'set'       },
        )
      )
      .addIntegerOption(o => o.setName('ilość').setDescription('Liczba tokenów').setRequired(true).setMinValue(0))
    ),

  // ── /lvl check ───────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'check') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const targetUser = interaction.options.getUser('gracz');
      if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction))
        return interaction.editReply({ content: '✕  Nie masz uprawnień.' });

      const lookupUser = targetUser ?? interaction.user;
      const { data }   = await getLevelDoc(lookupUser.id);
      const color      = await getUserColor(lookupUser.id, db);
      return interaction.editReply({ embeds: [buildLvlEmbed(lookupUser, data, color)] });
    }

    // ── /lvl ranking ────────────────────────────────────────────────────────
    if (sub === 'ranking') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const nearby = interaction.options.getBoolean('nearby') ?? false;

      if (!nearby) {
        // TOP 10
        const snap = await db.collection('levels').orderBy('totalXp', 'desc').limit(10).get();
        const entries = snap.docs.map((d, i) => ({ rank: i + 1, data: d.data() }));
        const embed   = await buildRankingEmbed(interaction.client, entries, 'TOP 10 — Ranking poziomów');
        return interaction.editReply({ embeds: [embed] });
      }

      // Nearby — pobierz top 100, znajdź gracza
      const snap  = await db.collection('levels').orderBy('totalXp', 'desc').limit(100).get();
      const all   = snap.docs.map((d, i) => ({ rank: i + 1, data: d.data() }));
      const myIdx = all.findIndex(e => e.data.userId === interaction.user.id);

      if (myIdx === -1) {
        // Gracza nie ma w top 100 — pokaż jego dane + top 5
        const { data: myData } = await getLevelDoc(interaction.user.id);
        const countAbove = (await db.collection('levels').where('totalXp', '>', myData.totalXp ?? 0).get()).size;
        const myRank     = countAbove + 1;

        const top5    = all.slice(0, 5);
        const myEntry = [{ rank: myRank, data: myData }];
        const entries = [...top5, { rank: '···', data: {} }, ...myEntry];

        const embed = await buildRankingEmbed(
          interaction.client,
          entries.filter(e => e.data.userId),
          'Ranking — Twoja pozycja',
          interaction.user.id,
        );
        return interaction.editReply({ embeds: [embed] });
      }

      // Pokaż ±5 graczy wokół użytkownika
      const from    = Math.max(0, myIdx - 5);
      const to      = Math.min(all.length, myIdx + 6);
      const entries = all.slice(from, to);
      const embed   = await buildRankingEmbed(
        interaction.client,
        entries,
        'Ranking — Twoja okolica',
        interaction.user.id,
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ── /lvl tokenset ────────────────────────────────────────────────────────
    if (sub === 'tokenset') {
      if (!isAdmin(interaction))
        return interaction.reply({ content: '✕  Tylko administratorzy.', flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetUser = interaction.options.getUser('gracz');
      const akcja      = interaction.options.getString('akcja');
      const ilosc      = interaction.options.getInteger('ilość');

      const { ref, data } = await getLevelDoc(targetUser.id);
      const current       = data.tokens ?? 0;

      let newTokens;
      if (akcja === 'add')      newTokens = current + ilosc;
      if (akcja === 'subtract') newTokens = Math.max(0, current - ilosc);
      if (akcja === 'set')      newTokens = ilosc;

      await ref.update({ tokens: newTokens });

      const actionLabel = { add: 'Dodano', subtract: 'Odjęto', set: 'Ustawiono na' }[akcja];

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setAuthor(boAuthor('TOKENY — AKTUALIZACJA'))
          .setColor(COLOR.RED)
          .addFields(
            { name: 'Gracz',    value: `${targetUser}`,       inline: true },
            { name: actionLabel, value: `**${ilosc}**`,        inline: true },
            { name: 'Bilans',   value: `${current} → **${newTokens}**`, inline: true },
          )
          .setFooter(boFooter(`Zmienił: ${interaction.user.username}`))
          .setTimestamp()],
      });
    }
  },

  // Eksport helpera do użycia w events/levels.js
  xpNeededForLevel,
  tokensForLevel,
  getLevelDoc,
};
