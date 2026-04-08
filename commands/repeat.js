// commands/repeat.js
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, MessageFlags,
} = require('discord.js');
const { db }                          = require('../firebase');
const { isAdmin }                     = require('../utils');
const { SEP, COLOR, boAuthor, boFooter } = require('../design');
const { startRepeat, stopRepeat }     = require('../repeats');

// ─── Helpers ──────────────────────────────────────────────────────────────
async function getAllRepeats() {
  const snap = await db.collection('repeats').orderBy('name').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function repeatStatus(r) { return r.active ? '▶ aktywny' : '⏸ wstrzymany'; }
function repeatFreq(r)   { return `co ${r.frequencyMinutes} min`; }
function repeatMode(r) {
  if (r.embedTitle) return `Embed z tytułem: "${r.embedTitle.slice(0, 30)}"`;
  if (r.useEmbed)   return 'Embed bez tytułu';
  return 'Tekst (plain)';
}

function buildListEmbed(repeats) {
  const lines = repeats.map((r, i) => {
    const last = r.lastSentAt ? `ostatnio: <t:${Math.floor(new Date(r.lastSentAt).getTime()/1000)}:R>` : 'nigdy';
    return `**${i+1}.** **${r.name}**  ·  ${repeatStatus(r)}  ·  ${repeatFreq(r)}\n` +
           `   Kanał: <#${r.channelId}>  ·  ${repeatMode(r)}  ·  ${last}`;
  });
  return new EmbedBuilder()
    .setAuthor(boAuthor('POWTARZAJĄCE SIĘ WIADOMOŚCI'))
    .setColor(COLOR.RED)
    .setDescription(lines.length ? lines.join('\n\n').slice(0, 4000) : '*Brak aktywnych repeatów.*')
    .setFooter(boFooter(`${repeats.length} repeat(ów)`));
}

function buildSelectMenu(repeats, customId) {
  if (!repeats.length) return null;
  const options = repeats.slice(0, 25).map(r =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${r.name} (${repeatStatus(r)})`.slice(0, 100))
      .setValue(r.id)
      .setDescription(`${repeatFreq(r)}  ·  ${repeatMode(r)}`.slice(0, 100))
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Wybierz repeat...').addOptions(options),
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────
// Pole "Tytuł embeda" — puste = embed bez tytułu; ". " (kropka) = plain text
// Prostsza konwencja: prefix "!" w treści = plain text
// Zamiast tego używamy pola "Tryb" z instrukcją w placeholderze

function buildAddModal(channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`repeat_add_modal__${channelId}`)
    .setTitle('Nowy Repeat');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_name')
        .setLabel('Nazwa (do identyfikacji, nie wyświetlana)')
        .setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_embed_title')
        .setLabel('Tytuł embeda (puste = embed bez tytułu)')
        .setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(false)
        .setPlaceholder('Zostaw puste by wysłać embed bez tytułu')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_content')
        .setLabel('Treść  (zacznij od "!!" by wysłać jako tekst)')
        .setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true)
        .setPlaceholder('Wpisz treść. Zacznij od !! żeby wysłać jako zwykły tekst zamiast embeda.')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_freq')
        .setLabel('Częstotliwość w minutach (min. 1)')
        .setStyle(TextInputStyle.Short).setPlaceholder('60').setMaxLength(6).setRequired(true)
    ),
  );
  return modal;
}

function buildEditModal(repeat) {
  const modal = new ModalBuilder()
    .setCustomId(`repeat_edit_modal__${repeat.id}`)
    .setTitle(`Edytuj: ${repeat.name.slice(0, 40)}`);

  // Odtwórz treść z prefiksem !! jeśli plain text
  const contentValue = !repeat.useEmbed && !repeat.embedTitle
    ? `!!${repeat.content}`
    : repeat.content;

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_name')
        .setLabel('Nazwa').setStyle(TextInputStyle.Short)
        .setValue(repeat.name).setMaxLength(80).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_embed_title')
        .setLabel('Tytuł embeda (puste = embed bez tytułu)')
        .setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(false)
        .setValue(repeat.embedTitle ?? '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_content')
        .setLabel('Treść (zacznij od "!!" by wysłać jako tekst)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(contentValue).setMaxLength(2000).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('repeat_freq')
        .setLabel('Częstotliwość w minutach')
        .setStyle(TextInputStyle.Short)
        .setValue(String(repeat.frequencyMinutes)).setMaxLength(6).setRequired(true)
    ),
  );
  return modal;
}

// ─── Parsuj dane z modala ─────────────────────────────────────────────────
function parseRepeatModal(fields) {
  const name       = fields.getTextInputValue('repeat_name').trim();
  const embedTitle = fields.getTextInputValue('repeat_embed_title').trim() || null;
  const rawContent = fields.getTextInputValue('repeat_content');
  const freqRaw    = fields.getTextInputValue('repeat_freq').trim();
  const freq       = Math.max(parseInt(freqRaw) || 60, 1);

  // Prefix "!!" = plain text
  const isPlainText = rawContent.startsWith('!!');
  const content     = isPlainText ? rawContent.slice(2).trimStart() : rawContent;
  const useEmbed    = !isPlainText;

  return { name, embedTitle: useEmbed ? embedTitle : null, content, useEmbed, frequencyMinutes: freq };
}

function modeLabel(data) {
  if (!data.useEmbed) return '📝 Tekst (plain)';
  if (data.embedTitle) return `📋 Embed z tytułem: "${data.embedTitle.slice(0, 40)}"`;
  return '📋 Embed bez tytułu';
}

// ─── Komenda ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('repeat')
    .setDescription('[ADMIN] Zarządzaj powtarzającymi się wiadomościami')
    .addSubcommand(sub => sub
      .setName('dodaj').setDescription('[ADMIN] Dodaj nową powtarzającą się wiadomość')
      .addChannelOption(opt =>
        opt.setName('kanał').setDescription('Kanał docelowy').setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement,
            ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildForum)
      )
    )
    .addSubcommand(sub => sub.setName('lista').setDescription('[ADMIN] Wyświetl wszystkie repeaty'))
    .addSubcommand(sub => sub.setName('usuń').setDescription('[ADMIN] Usuń repeat'))
    .addSubcommand(sub => sub.setName('pauza').setDescription('[ADMIN] Wstrzymaj lub wznów repeat'))
    .addSubcommand(sub => sub.setName('edytuj').setDescription('[ADMIN] Edytuj istniejący repeat')),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą zarządzać repeatami.', flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === 'dodaj') {
      const channel = interaction.options.getChannel('kanał');
      return interaction.showModal(buildAddModal(channel.id));
    }

    if (sub === 'lista') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const repeats = await getAllRepeats();
      return interaction.editReply({ embeds: [buildListEmbed(repeats)] });
    }

    if (sub === 'usuń') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const repeats = await getAllRepeats();
      const row     = buildSelectMenu(repeats, 'repeat_delete_select');
      if (!row) return interaction.editReply({ content: '✕  Brak repeatów do usunięcia.' });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('USUŃ REPEAT')).setColor(COLOR.RED)
          .setDescription('Wybierz repeat do usunięcia. **Akcja jest nieodwracalna.**')],
        components: [row],
      });
    }

    if (sub === 'pauza') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const repeats = await getAllRepeats();
      const row     = buildSelectMenu(repeats, 'repeat_pause_select');
      if (!row) return interaction.editReply({ content: '✕  Brak repeatów.' });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('WSTRZYMAJ / WZNÓW')).setColor(COLOR.RED)
          .setDescription('Wybierz repeat do wstrzymania lub wznowienia.')],
        components: [row],
      });
    }

    if (sub === 'edytuj') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const repeats = await getAllRepeats();
      const row     = buildSelectMenu(repeats, 'repeat_edit_select');
      if (!row) return interaction.editReply({ content: '✕  Brak repeatów do edycji.' });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('EDYTUJ REPEAT')).setColor(COLOR.RED)
          .setDescription('Wybierz repeat do edycji.')],
        components: [row],
      });
    }
  },

  // ─── Modal — dodaj ────────────────────────────────────────────────────
  async handleAddModal(interaction, client) {
    const channelId = interaction.customId.split('__')[1];
    const data      = parseRepeatModal(interaction.fields);

    const channel = client.channels.cache.get(channelId)
                 ?? await client.channels.fetch(channelId).catch(() => null);
    if (!channel)
      return interaction.reply({ content: '✕  Nie znaleziono kanału.', flags: MessageFlags.Ephemeral });

    if (!data.content)
      return interaction.reply({ content: '✕  Treść nie może być pusta.', flags: MessageFlags.Ephemeral });

    const ref = await db.collection('repeats').add({
      name:             data.name,
      content:          data.content,
      embedTitle:       data.embedTitle,
      useEmbed:         data.useEmbed,
      channelId,
      frequencyMinutes: data.frequencyMinutes,
      active:    true,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
      lastSentAt: null,
    });

    const repeat = { id: ref.id, ...data, channelId, active: true };
    startRepeat(client, repeat);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setAuthor(boAuthor('REPEAT DODANY')).setColor(COLOR.RED)
        .addFields(
          { name: 'Nazwa',         value: data.name,                 inline: true },
          { name: 'Kanał',         value: `<#${channelId}>`,         inline: true },
          { name: 'Częstotliwość', value: `co ${data.frequencyMinutes} min`, inline: true },
          { name: 'Tryb',          value: modeLabel(data),           inline: false },
        )
        .setDescription(`${SEP}\n${data.content.slice(0, 300)}${data.content.length > 300 ? '…' : ''}`)
        .setFooter(boFooter()).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  },

  // ─── Select — usuń ────────────────────────────────────────────────────
  async handleDeleteSelect(interaction) {
    const id  = interaction.values[0];
    const doc = await db.collection('repeats').doc(id).get();
    if (!doc.exists) return interaction.update({ content: '✕  Repeat nie istnieje.', components: [], embeds: [] });
    const { name } = doc.data();
    stopRepeat(id);
    await db.collection('repeats').doc(id).delete();
    return interaction.update({
      embeds: [new EmbedBuilder().setAuthor(boAuthor('REPEAT USUNIĘTY')).setColor(COLOR.MUTED)
        .setDescription(`\`${name}\` — usunięty.`).setTimestamp()],
      components: [],
    });
  },

  // ─── Select — pauza/wznów ─────────────────────────────────────────────
  async handlePauseSelect(interaction, client) {
    const id        = interaction.values[0];
    const doc       = await db.collection('repeats').doc(id).get();
    if (!doc.exists) return interaction.update({ content: '✕  Repeat nie istnieje.', components: [], embeds: [] });
    const repeat    = { id, ...doc.data() };
    const newActive = !repeat.active;
    await db.collection('repeats').doc(id).update({ active: newActive });
    if (newActive) startRepeat(client, { ...repeat, active: true });
    else           stopRepeat(id);
    return interaction.update({
      embeds: [new EmbedBuilder()
        .setAuthor(boAuthor(newActive ? 'REPEAT WZNOWIONY' : 'REPEAT WSTRZYMANY'))
        .setColor(newActive ? COLOR.RED : COLOR.MUTED)
        .addFields({ name: 'Nazwa', value: repeat.name, inline: true })
        .setDescription(newActive ? 'Repeat został wznowiony.' : 'Repeat został wstrzymany.')
        .setTimestamp()],
      components: [],
    });
  },

  // ─── Select — edytuj (modal) ──────────────────────────────────────────
  async handleEditSelect(interaction) {
    const id  = interaction.values[0];
    const doc = await db.collection('repeats').doc(id).get();
    if (!doc.exists) return interaction.reply({ content: '✕  Repeat nie istnieje.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(buildEditModal({ id, ...doc.data() }));
  },

  // ─── Modal — zapisz edycję ────────────────────────────────────────────
  async handleEditModal(interaction, client) {
    const id   = interaction.customId.split('__')[1];
    const data = parseRepeatModal(interaction.fields);

    const doc = await db.collection('repeats').doc(id).get();
    if (!doc.exists) return interaction.reply({ content: '✕  Repeat nie istnieje.', flags: MessageFlags.Ephemeral });

    const repeat = { id, ...doc.data(), ...data };
    await db.collection('repeats').doc(id).update({
      name:             data.name,
      content:          data.content,
      embedTitle:       data.embedTitle,
      useEmbed:         data.useEmbed,
      frequencyMinutes: data.frequencyMinutes,
      updatedAt:        new Date().toISOString(),
    });

    if (repeat.active) startRepeat(client, repeat);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setAuthor(boAuthor('REPEAT ZAKTUALIZOWANY')).setColor(COLOR.RED)
        .addFields(
          { name: 'Nazwa',         value: data.name,                        inline: true },
          { name: 'Kanał',         value: `<#${repeat.channelId}>`,         inline: true },
          { name: 'Częstotliwość', value: `co ${data.frequencyMinutes} min`, inline: true },
          { name: 'Tryb',          value: modeLabel(data),                  inline: false },
        )
        .setDescription(`${SEP}\n${data.content.slice(0, 300)}${data.content.length > 300 ? '…' : ''}`)
        .setFooter(boFooter()).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
