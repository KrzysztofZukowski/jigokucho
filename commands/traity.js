// commands/traity.js — zarządzanie listą traitów (tylko admin)
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { db }                                           = require('../firebase');
const { isAdmin }                                      = require('../utils');
const { SEP, boAuthor, boFooter, IMG, COLOR }          = require('../design');

const COLL = 'traits';

async function getAllTraits() {
  const snap = await db.collection(COLL).orderBy('name').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function buildListEmbed(traits) {
  const lines = traits.map((t, i) =>
    `**${i + 1}.**  ${t.name}\n\`${(t.description ?? '').slice(0, 90)}${(t.description?.length ?? 0) > 90 ? '…' : ''}\``
  );
  return new EmbedBuilder()
    .setAuthor(boAuthor('LISTA TRAITÓW'))
    .setColor(COLOR.RED)
    .setDescription(lines.length ? lines.join('\n\n').slice(0, 4000) : `*Brak traitów. Dodaj pierwszy używając* \`/traity dodaj\`.`)
    .setFooter(boFooter(`${traits.length} trait(ów)`));
}

function buildSelectMenu(traits, customId) {
  if (!traits.length) return null;
  const options = traits.slice(0, 25).map(t =>
    new StringSelectMenuOptionBuilder()
      .setLabel(t.name.slice(0, 100))
      .setValue(t.id)
      .setDescription((t.description ?? '').slice(0, 100))
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Wybierz trait...').addOptions(options),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('traity')
    .setDescription('[ADMIN] Zarządzaj listą traitów')
    .addSubcommand(sub => sub.setName('dodaj').setDescription('[ADMIN] Dodaj nowy trait')
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa traita').setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName('opis').setDescription('Opis traita').setRequired(true).setMaxLength(900))
    )
    .addSubcommand(sub => sub.setName('lista').setDescription('[ADMIN] Wyświetl wszystkie traity'))
    .addSubcommand(sub => sub.setName('usuń').setDescription('[ADMIN] Usuń trait z listy'))
    .addSubcommand(sub => sub.setName('edytuj').setDescription('[ADMIN] Edytuj istniejący trait')),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą zarządzać traitami.', flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === 'dodaj') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const nazwa = interaction.options.getString('nazwa').trim();
      const opis  = interaction.options.getString('opis').trim();
      const exists = await db.collection(COLL).where('name', '==', nazwa).limit(1).get();
      if (!exists.empty) return interaction.editReply({ content: `✕  Trait **${nazwa}** już istnieje.` });
      const ref = await db.collection(COLL).add({ name: nazwa, description: opis, createdAt: new Date().toISOString(), createdBy: interaction.user.id });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('TRAIT DODANY')).setColor(COLOR.RED)
          .addFields({ name: 'Nazwa', value: nazwa, inline: true }, { name: 'ID', value: `\`${ref.id}\``, inline: true })
          .setDescription(`${SEP}\n${opis}`).setFooter(boFooter()).setTimestamp()],
      });
    }

    if (sub === 'lista') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return interaction.editReply({ embeds: [buildListEmbed(await getAllTraits())] });
    }

    if (sub === 'usuń') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const traits = await getAllTraits();
      const row    = buildSelectMenu(traits, 'trait_delete_select');
      if (!row) return interaction.editReply({ content: '✕  Brak traitów do usunięcia.' });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('USUŃ TRAIT')).setColor(COLOR.RED)
          .setDescription('Wybierz trait do usunięcia. **Akcja jest nieodwracalna.**')],
        components: [row],
      });
    }

    if (sub === 'edytuj') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const traits = await getAllTraits();
      const row    = buildSelectMenu(traits, 'trait_edit_select');
      if (!row) return interaction.editReply({ content: '✕  Brak traitów do edycji.' });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('EDYTUJ TRAIT')).setColor(COLOR.RED)
          .setDescription('Wybierz trait do edycji.')],
        components: [row],
      });
    }
  },

  async handleDeleteSelect(interaction) {
    const traitDoc = await db.collection(COLL).doc(interaction.values[0]).get();
    if (!traitDoc.exists) return interaction.update({ content: '✕  Trait nie istnieje.', components: [], embeds: [] });
    const { name } = traitDoc.data();
    await db.collection(COLL).doc(interaction.values[0]).delete();
    return interaction.update({
      embeds: [new EmbedBuilder().setAuthor(boAuthor('TRAIT USUNIĘTY')).setColor(COLOR.MUTED)
        .setDescription(`\`${name}\` — usunięty z puli.`).setTimestamp()],
      components: [],
    });
  },

  async handleEditSelect(interaction) {
    const traitDoc = await db.collection(COLL).doc(interaction.values[0]).get();
    if (!traitDoc.exists) return interaction.reply({ content: '✕  Trait nie istnieje.', flags: MessageFlags.Ephemeral });
    const trait = traitDoc.data();
    const modal  = new ModalBuilder().setCustomId(`trait_edit_modal__${interaction.values[0]}`).setTitle(`Edytuj: ${trait.name.slice(0, 40)}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trait_name').setLabel('Nazwa').setStyle(TextInputStyle.Short).setValue(trait.name).setMaxLength(80).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trait_desc').setLabel('Opis').setStyle(TextInputStyle.Paragraph).setValue(trait.description ?? '').setMaxLength(900).setRequired(true)),
    );
    return interaction.showModal(modal);
  },

  async handleEditModal(interaction) {
    const traitId = interaction.customId.split('__')[1];
    const newName = interaction.fields.getTextInputValue('trait_name').trim();
    const newDesc = interaction.fields.getTextInputValue('trait_desc').trim();
    await db.collection(COLL).doc(traitId).update({ name: newName, description: newDesc, updatedAt: new Date().toISOString(), updatedBy: interaction.user.id });
    return interaction.reply({
      embeds: [new EmbedBuilder().setAuthor(boAuthor('TRAIT ZAKTUALIZOWANY')).setColor(COLOR.RED)
        .addFields({ name: 'Nowa nazwa', value: newName, inline: true })
        .setDescription(`${SEP}\n${newDesc}`).setFooter(boFooter()).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
