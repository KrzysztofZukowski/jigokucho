// commands/embed.js — builder embedów przez modal (2 strony)
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { isAdmin }              = require('../utils');
const { boFooter, IMG, COLOR } = require('../design');

// ─── Sesje tymczasowe userId → dane embeda ────────────────────────────────
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
}, 30_000);

function saveSession(userId, data) {
  sessions.set(userId, { ...data, expires: Date.now() + 10 * 60_000 });
}
function getSession(userId) {
  const s = sessions.get(userId);
  return (s && s.expires > Date.now()) ? s : null;
}

// ─── Walidacja URL ────────────────────────────────────────────────────────
function validUrl(url) {
  if (!url || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? url.trim() : null;
  } catch { return null; }
}

function parseColor(hex) {
  if (!hex) return null;
  const clean  = hex.replace('#', '').trim().padStart(6, '0');
  const parsed = parseInt(clean, 16);
  return isNaN(parsed) ? null : parsed;
}

// ─── Buduj embed z danych sesji ───────────────────────────────────────────
function buildFromSession(s, interactionUser, botUser) {
  const embed = new EmbedBuilder().setColor(parseColor(s.color) ?? COLOR.RED);

  if (s.title)       embed.setTitle(s.title.slice(0, 256));
  if (s.description) embed.setDescription(s.description.slice(0, 4096));

  const titleUrl = validUrl(s.url);
  if (titleUrl)  embed.setURL(titleUrl);

  const imgUrl  = validUrl(s.image);
  const thumbUrl = validUrl(s.thumbnail);
  if (imgUrl)   embed.setImage(imgUrl);
  if (thumbUrl) embed.setThumbnail(thumbUrl);

  if (s.authorName) {
    let iconURL;
    const ai = (s.authorIcon ?? '').trim().toLowerCase();
    if (ai === 'własne' || ai === 'own') {
      iconURL = interactionUser.displayAvatarURL({ size: 128, forceStatic: false })
             ?? interactionUser.defaultAvatarURL
             ?? undefined;
    } else if (ai === 'bot') {
      // displayAvatarURL zwraca null gdy bot uzywa domyslnego avatara Discord
      iconURL = botUser.displayAvatarURL({ size: 128, forceStatic: false })
             ?? botUser.defaultAvatarURL
             ?? IMG.BUTTERFLY;
    } else {
      iconURL = validUrl(s.authorIcon) ?? undefined;
    }
    embed.setAuthor({ name: s.authorName.slice(0, 256), iconURL });
  }

  let footerIconURL = IMG.BUTTERFLY;
  const fi = (s.footerIcon ?? '').trim().toLowerCase();
  if (fi === 'bot') footerIconURL = botUser.displayAvatarURL({ size: 128 });
  else { const fu = validUrl(s.footerIcon); if (fu) footerIconURL = fu; }

  // Pokaż stopkę jeśli jest tekst LUB jeśli jawnie wybrano ikonę (fi !== '')
  const showFooter = !!(s.footerText) || fi === 'bot' || !!(validUrl(s.footerIcon));
  if (showFooter) {
    embed.setFooter({ text: (s.footerText ?? '').slice(0, 2048) || '​', iconURL: footerIconURL });
  }

  if (s.timestamp !== false) embed.setTimestamp();

  return embed;
}

// ─── Przyciski podglądu ───────────────────────────────────────────────────
function previewRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed_send').setLabel('Wyślij na kanał').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('embed_page2').setLabel('Autor / Stopka / Zaawansowane →').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed_page1').setLabel('← Wróć do strony 1').setStyle(ButtonStyle.Secondary),
  );
}

// ─── Modal strona 1: Treść ────────────────────────────────────────────────
function modal1(s = {}) {
  const m = new ModalBuilder().setCustomId('embed_modal1').setTitle('Embed — Treść (1/2)');
  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_title').setLabel('Tytuł').setStyle(TextInputStyle.Short)
        .setValue(s.title ?? '').setRequired(false).setMaxLength(256)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_desc').setLabel('Opis / treść').setStyle(TextInputStyle.Paragraph)
        .setValue(s.description ?? '').setRequired(false).setMaxLength(4000)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_color').setLabel('Kolor (hex, np. #dc3232)').setStyle(TextInputStyle.Short)
        .setValue(s.color ?? '').setRequired(false).setMaxLength(10)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_image').setLabel('URL dużego obrazu (dół embeda)').setStyle(TextInputStyle.Short)
        .setValue(s.image ?? '').setRequired(false).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_thumb').setLabel('URL miniatury (prawy górny róg)').setStyle(TextInputStyle.Short)
        .setValue(s.thumbnail ?? '').setRequired(false).setMaxLength(500)
    ),
  );
  return m;
}

// ─── Modal strona 2: Autor, stopka, url ──────────────────────────────────
function modal2(s = {}) {
  const m = new ModalBuilder().setCustomId('embed_modal2').setTitle('Embed — Szczegóły (2/2)');
  m.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_author_name').setLabel('Autor — nazwa').setStyle(TextInputStyle.Short)
        .setValue(s.authorName ?? '').setRequired(false).setMaxLength(256)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_author_icon').setLabel('Autor — ikona: "własne" | "bot" | URL').setStyle(TextInputStyle.Short)
        .setValue(s.authorIcon ?? '').setRequired(false).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_footer_text').setLabel('Stopka — tekst').setStyle(TextInputStyle.Short)
        .setValue(s.footerText ?? '').setRequired(false).setMaxLength(2048)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_footer_icon').setLabel('Stopka — ikona: "bot" | URL').setStyle(TextInputStyle.Short)
        .setValue(s.footerIcon ?? '').setRequired(false).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('em_url').setLabel('URL tytułu (tytuł staje się klikalny)').setStyle(TextInputStyle.Short)
        .setValue(s.url ?? '').setRequired(false).setMaxLength(500)
    ),
  );
  return m;
}

// ─── Eksport ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('[ADMIN] Wyślij embed na wybrany kanał')
    .addChannelOption(o => o.setName('kanał').setDescription('Kanał docelowy').setRequired(true)),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą wysyłać embedy.', flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel('kanał');
    saveSession(interaction.user.id, { channelId: channel.id });
    return interaction.showModal(modal1());
  },

  async handleModal1(interaction) {
    const s       = getSession(interaction.user.id) ?? {};
    const updated = {
      ...s,
      title:       interaction.fields.getTextInputValue('em_title').trim()  || null,
      description: interaction.fields.getTextInputValue('em_desc').trim()   || null,
      color:       interaction.fields.getTextInputValue('em_color').trim()  || null,
      image:       interaction.fields.getTextInputValue('em_image').trim()  || null,
      thumbnail:   interaction.fields.getTextInputValue('em_thumb').trim()  || null,
    };
    saveSession(interaction.user.id, updated);
    if (!updated.title && !updated.description)
      return interaction.reply({ content: '✕  Embed musi mieć tytuł lub opis.', flags: MessageFlags.Ephemeral });

    const embed = buildFromSession(updated, interaction.user, interaction.client.user);
    return interaction.reply({ content: `**Podgląd** → wyślę na <#${updated.channelId}>`, embeds: [embed], components: [previewRow()], flags: MessageFlags.Ephemeral });
  },

  async handlePage1(interaction) {
    const s = getSession(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(modal1(s));
  },

  async handlePage2(interaction) {
    const s = getSession(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(modal2(s));
  },

  async handleModal2(interaction) {
    const s = getSession(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła. Użyj `/embed` ponownie.', flags: MessageFlags.Ephemeral });
    // Spread ...s zachowuje image/thumbnail/title/description z modal1 — nadpisujemy tylko pola modal2
    const updated = {
      ...s,
      authorName: interaction.fields.getTextInputValue('em_author_name').trim() || null,
      authorIcon: interaction.fields.getTextInputValue('em_author_icon').trim() || null,
      footerText: interaction.fields.getTextInputValue('em_footer_text').trim() || null,
      footerIcon: interaction.fields.getTextInputValue('em_footer_icon').trim() || null,
      url:        interaction.fields.getTextInputValue('em_url').trim()         || null,
      // image i thumbnail NIE są w modal2 — zachowujemy z sesji (już w ...s)
    };
    saveSession(interaction.user.id, updated);
    const embed = buildFromSession(updated, interaction.user, interaction.client.user);
    return interaction.reply({ content: `**Podgląd zaktualizowany** → wyślę na <#${updated.channelId}>`, embeds: [embed], components: [previewRow()], flags: MessageFlags.Ephemeral });
  },

  async handleSend(interaction) {
    const s = getSession(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła. Użyj `/embed` ponownie.', flags: MessageFlags.Ephemeral });
    const embed = buildFromSession(s, interaction.user, interaction.client.user);
    try {
      const ch = interaction.client.channels.cache.get(s.channelId) ?? await interaction.client.channels.fetch(s.channelId);
      await ch.send({ embeds: [embed] });
      sessions.delete(interaction.user.id);
      return interaction.update({ content: `✓  Embed wysłany na <#${s.channelId}>.`, embeds: [], components: [] });
    } catch {
      return interaction.reply({ content: '✕  Nie mogłem wysłać. Sprawdź uprawnienia bota.', flags: MessageFlags.Ephemeral });
    }
  },
};
