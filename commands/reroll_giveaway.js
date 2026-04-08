// commands/reroll_giveaway.js — Context Menu: prawy klik na wiadomość → Apps → Reroll Giveaway
const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags, EmbedBuilder } = require('discord.js');
const { db }                  = require('../firebase');
const { isAdmin }             = require('../utils');
const { COLOR, boAuthor, boFooter } = require('../design');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Reroll Giveaway')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą rerollować.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetMsg = interaction.targetMessage;

    // Znajdź giveaway po messageId
    const snap = await db.collection('giveaways').where('messageId', '==', targetMsg.id).limit(1).get();
    if (snap.empty)
      return interaction.editReply({ content: '✕  Ta wiadomość nie jest giveawayem.' });

    const giveaway   = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const partSnap   = await db.collection('giveaways').doc(giveaway.id).collection('participants').get();
    const pool       = partSnap.docs.map(d => d.id);

    if (!pool.length)
      return interaction.editReply({ content: '✕  Brak uczestników do losowania.' });

    const winnersCount = giveaway.winnersCount ?? 1;
    const newWinners   = [];
    const copy         = [...pool];
    while (newWinners.length < winnersCount && copy.length > 0) {
      newWinners.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }

    await db.collection('giveaways').doc(giveaway.id).update({ winners: newWinners });

    const ch = interaction.client.channels.cache.get(giveaway.channelId)
            ?? await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
    if (ch) {
      const winnersStr = newWinners.map(id => `<@${id}>`).join(', ');
      await ch.send({
        content: `✦  **Reroll!** Nowi zwycięzcy: ${winnersStr} — Nagroda: **${giveaway.prize}**`,
      });
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder().setAuthor(boAuthor('REROLL')).setColor(COLOR.RED)
        .setDescription(`Nowi zwycięzcy:\n${newWinners.map(id => `<@${id}>`).join('\n')}`)
        .setFooter(boFooter()).setTimestamp()],
    });
  },
};
