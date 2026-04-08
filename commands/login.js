// commands/login.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { db }                                              = require('../firebase');
const { isAdmin }                                         = require('../utils');
const { SEP, COLOR, boAuthor, boFooter }                  = require('../design');

const PLAYER_ROLE_ID = '1489957549712343040'; // rola nadawana po przypisaniu loginu

module.exports = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('System logowania Black Outpost')
    .addSubcommand(sub => sub.setName('check').setDescription('Sprawdź swój identyfikator logowania'))
    .addSubcommand(sub => sub.setName('set').setDescription('[ADMIN] Przypisz identyfikator do gracza')
      .addUserOption(o => o.setName('gracz').setDescription('Użytkownik Discord').setRequired(true))
      .addStringOption(o => o.setName('identyfikator').setDescription('Identyfikator (np. AkaIwa1234)').setRequired(true).setMinLength(5).setMaxLength(20))
    )
    .addSubcommand(sub => sub.setName('remove').setDescription('[ADMIN] Usuń powiązanie identyfikatora')
      .addUserOption(o => o.setName('gracz').setDescription('Użytkownik Discord').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /login check ──────────────────────────────────────────────────────
    if (sub === 'check') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const linkDoc = await db.collection('discordLinks').doc(interaction.user.id).get();
      if (!linkDoc.exists || !linkDoc.data()?.identifier) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setAuthor(boAuthor()).setColor(COLOR.MUTED)
            .setDescription('✕  Twoje konto nie jest powiązane z żadnym identyfikatorem.\nSkontaktuj się z administratorem.')],
        });
      }
      const { identifier } = linkDoc.data();
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('IDENTYFIKATOR LOGOWANIA')).setColor(COLOR.RED)
          .setDescription(`${SEP}\nUżyj poniższego identyfikatora aby zalogować się na stronie Black Outpost.\n**Nie udostępniaj go nikomu.**`)
          .addFields({ name: 'Identyfikator', value: `\`\`\`${identifier}\`\`\`` })
          .setFooter(boFooter('Widoczne tylko dla ciebie'))],
      });
    }

    // ── Admin-only ────────────────────────────────────────────────────────
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Nie masz uprawnień do tej komendy.', flags: MessageFlags.Ephemeral });

    // ── /login set ────────────────────────────────────────────────────────
    if (sub === 'set') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const targetUser = interaction.options.getUser('gracz');
      const identifier = interaction.options.getString('identyfikator').trim();
      const existing   = await db.collection('discordLinks').where('identifier', '==', identifier).get();
      if (!existing.empty && existing.docs[0].id !== targetUser.id) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setAuthor(boAuthor()).setColor(COLOR.MUTED)
            .setDescription(`✕  Identyfikator \`${identifier}\` jest już przypisany do <@${existing.docs[0].id}>.\nUsuń tamto powiązanie najpierw.`)],
        });
      }
      await db.collection('discordLinks').doc(targetUser.id).set({
        identifier, discordUsername: targetUser.username,
        assignedBy: interaction.user.id, assignedAt: new Date().toISOString(),
      });

      // Nadaj rolę gracza Discord
      try {
        const member = interaction.guild.members.cache.get(targetUser.id)
                    ?? await interaction.guild.members.fetch(targetUser.id);
        if (member && !member.roles.cache.has(PLAYER_ROLE_ID)) {
          await member.roles.add(PLAYER_ROLE_ID, 'Przypisano konto Black Outpost');
        }
      } catch (err) {
        console.warn('[LOGIN] Nie udało się nadać roli:', err.message);
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('IDENTYFIKATOR PRZYPISANY')).setColor(COLOR.RED)
          .addFields(
            { name: 'Gracz Discord', value: `${targetUser}`, inline: true },
            { name: 'Identyfikator', value: `\`${identifier}\``, inline: true },
          )
          .setFooter(boFooter(`Przypisał: ${interaction.user.username}`))
          .setTimestamp()],
      });
    }

    // ── /login remove ─────────────────────────────────────────────────────
    if (sub === 'remove') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const targetUser = interaction.options.getUser('gracz');
      const linkDoc    = await db.collection('discordLinks').doc(targetUser.id).get();
      if (!linkDoc.exists)
        return interaction.editReply({ content: `✕  ${targetUser} nie ma przypisanego identyfikatora.` });
      const { identifier } = linkDoc.data();
      await db.collection('discordLinks').doc(targetUser.id).delete();
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('POWIĄZANIE USUNIĘTE')).setColor(COLOR.MUTED)
          .addFields(
            { name: 'Gracz', value: `${targetUser}`, inline: true },
            { name: 'Identyfikator', value: `\`${identifier}\``, inline: true },
          )
          .setTimestamp()],
      });
    }
  },
};
