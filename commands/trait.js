// commands/trait.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { db }                                              = require('../firebase');
const { isAdmin }                                         = require('../utils');
const { SEP, parseHexColor, boAuthor, boFooter }          = require('../design');

async function fetchCharByDiscordId(discordId) {
  const linkDoc = await db.collection('discordLinks').doc(discordId).get();
  if (!linkDoc.exists) return null;
  const { identifier } = linkDoc.data();
  const snap = await db.collection('characters').where('identifier', '==', identifier).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function buildTraitEmbed(char, trait, color, subtitle) {
  const name = `${char.firstName ?? ''} ${char.lastName ?? ''}`.trim();
  // Użyj faktycznej daty wylosowania jako timestamp (nie bieżącej)
  const rollDate = trait.rolledAt ? new Date(trait.rolledAt) : new Date();

  return new EmbedBuilder()
    .setAuthor(boAuthor(subtitle ?? `TRAIT  ·  ${name}`))
    .setColor(color)
    .addFields({ name: 'TRAIT', value: `**${trait.name}**` })
    .setDescription(`${SEP}\n${trait.description || '*Brak opisu.*'}`)
    .setFooter(boFooter())
    .setTimestamp(rollDate);  // ← faktyczna data losowania
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trait')
    .setDescription('Wylosuj swój Trait lub sprawdź traita gracza')
    .addUserOption(opt =>
      opt.setName('gracz').setDescription('[ADMIN] Sprawdź traita konkretnego gracza').setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('gracz');
    if (targetUser && targetUser.id !== interaction.user.id && !isAdmin(interaction))
      return interaction.editReply({ content: '✕  Nie masz uprawnień do sprawdzania traitów innych graczy.' });

    const lookupId = targetUser ? targetUser.id : interaction.user.id;
    const isOwn    = lookupId === interaction.user.id;
    const char     = await fetchCharByDiscordId(lookupId);

    if (!char) return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor())
        .setDescription(isOwn
          ? '✕  Twoje konto nie jest powiązane z żadną postacią.'
          : `✕  Użytkownik <@${lookupId}> nie ma przypisanej postaci.`)],
    });

    const color = parseHexColor(char.riatsuColor?.hex);
    const name  = `${char.firstName ?? ''} ${char.lastName ?? ''}`.trim();

    // Admin sprawdza traita gracza
    if (!isOwn) {
      if (!char.trait) return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor(`TRAIT  ·  ${name}`))
          .setDescription('Ta postać nie wylosowała jeszcze traita.')],
      });
      return interaction.editReply({ embeds: [buildTraitEmbed(char, char.trait, color, `TRAIT  ·  ${name}`)] });
    }

    // Gracz sprawdza własny trait
    if (char.trait) {
      return interaction.editReply({ embeds: [buildTraitEmbed(char, char.trait, color, 'TWÓJ TRAIT')] });
    }

    // Losowanie
    const traitsSnap = await db.collection('traits').get();
    const traits     = traitsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!traits.length) return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x1a1a24).setAuthor(boAuthor())
        .setDescription('✕  Administrator nie dodał jeszcze żadnych traitów do puli.')],
    });

    const rolled = traits[Math.floor(Math.random() * traits.length)];
    const saved  = { id: rolled.id, name: rolled.name, description: rolled.description ?? '', rolledAt: new Date().toISOString() };
    await db.collection('characters').doc(char.id).update({ trait: saved });

    return interaction.editReply({ embeds: [buildTraitEmbed(char, saved, color, 'TRAIT WYLOSOWANY')] });
  },
};
