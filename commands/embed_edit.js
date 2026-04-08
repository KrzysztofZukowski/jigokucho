// commands/embed_edit.js — Context Menu: "Edytuj Embed" (prawy klik na wiadomość)
const {
  ContextMenuCommandBuilder, ApplicationCommandType,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { isAdmin }              = require('../utils');
const { COLOR, IMG, boFooter } = require('../design');

// ─── Sesje edycji: userId → { messageId, channelId, ...embedData } ────────
const sessions = new Map();
setInterval(() => { const now = Date.now(); for (const [k,v] of sessions) if (v.expires < now) sessions.delete(k); }, 30_000);
function save(userId, data) { sessions.set(userId, { ...data, expires: Date.now() + 15 * 60_000 }); }
function get(userId) { const s = sessions.get(userId); return (s && s.expires > Date.now()) ? s : null; }

// ─── Helpers ──────────────────────────────────────────────────────────────
function validUrl(url) {
  if (!url?.trim()) return null;
  try { const u = new URL(url.trim()); return (u.protocol === 'http:' || u.protocol === 'https:') ? url.trim() : null; }
  catch { return null; }
}
function parseColor(hex) {
  if (!hex) return null;
  const c = parseInt(hex.replace('#','').padStart(6,'0'), 16);
  return isNaN(c) ? null : c;
}

function embedToSession(embed) {
  return {
    title:       embed.title            ?? null,
    description: embed.description      ?? null,
    color:       embed.color !== null && embed.color !== undefined
                   ? '#' + embed.color.toString(16).padStart(6, '0') : null,
    image:       embed.image?.url       ?? null,
    thumbnail:   embed.thumbnail?.url   ?? null,
    authorName:  embed.author?.name     ?? null,
    authorIcon:  embed.author?.iconURL  ?? null,
    footerText:  embed.footer?.text     ?? null,
    footerIcon:  embed.footer?.iconURL  ?? null,
    url:         embed.url              ?? null,
  };
}

function buildEmbed(s, botUser) {
  const embed = new EmbedBuilder().setColor(parseColor(s.color) ?? COLOR.RED);
  if (s.title)       embed.setTitle(s.title.slice(0, 256));
  if (s.description) embed.setDescription(s.description.slice(0, 4096));
  const tu = validUrl(s.url); if (tu) embed.setURL(tu);
  const iu = validUrl(s.image); if (iu) embed.setImage(iu);
  const thu = validUrl(s.thumbnail); if (thu) embed.setThumbnail(thu);
  if (s.authorName) {
    const ai = (s.authorIcon ?? '').trim().toLowerCase();
    const iconURL = ai === 'bot'
      ? (botUser.displayAvatarURL({ size: 128, forceStatic: false }) ?? botUser.defaultAvatarURL ?? IMG.BUTTERFLY)
      : (validUrl(s.authorIcon) ?? undefined);
    embed.setAuthor({ name: s.authorName.slice(0, 256), iconURL });
  }
  const fi = (s.footerIcon ?? '').trim().toLowerCase();
  const footerIconURL = fi === 'bot'
    ? (botUser.displayAvatarURL({ size: 128, forceStatic: false }) ?? botUser.defaultAvatarURL ?? IMG.BUTTERFLY)
    : (validUrl(s.footerIcon) ?? IMG.BUTTERFLY);
  const showFooter = !!(s.footerText) || fi === 'bot' || !!(validUrl(s.footerIcon));
  if (showFooter) embed.setFooter({ text: (s.footerText ?? '').slice(0, 2048) || '\u200b', iconURL: footerIconURL });
  embed.setTimestamp();
  return embed;
}

// ─── Przyciski podglądu ───────────────────────────────────────────────────
function previewRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('emedit_page1').setLabel('← Strona 1 (treść)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('emedit_page2').setLabel('Strona 2 (szczegóły)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('emedit_apply').setLabel('✓ Zastosuj zmiany').setStyle(ButtonStyle.Primary),
  );
}

function modal1(s = {}) {
  const m = new ModalBuilder().setCustomId('emedit_modal1').setTitle('Edytuj embed — Treść (1/2)');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_title').setLabel('Tytuł').setStyle(TextInputStyle.Short).setValue(s.title ?? '').setRequired(false).setMaxLength(256)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_desc').setLabel('Opis / treść').setStyle(TextInputStyle.Paragraph).setValue(s.description ?? '').setRequired(false).setMaxLength(4000)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_color').setLabel('Kolor (hex)').setStyle(TextInputStyle.Short).setValue(s.color ?? '').setRequired(false).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_image').setLabel('URL dużego obrazu').setStyle(TextInputStyle.Short).setValue(s.image ?? '').setRequired(false).setMaxLength(500)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_thumb').setLabel('URL miniatury').setStyle(TextInputStyle.Short).setValue(s.thumbnail ?? '').setRequired(false).setMaxLength(500)),
  );
  return m;
}

function modal2(s = {}) {
  const m = new ModalBuilder().setCustomId('emedit_modal2').setTitle('Edytuj embed — Szczegóły (2/2)');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_author_name').setLabel('Autor — nazwa').setStyle(TextInputStyle.Short).setValue(s.authorName ?? '').setRequired(false).setMaxLength(256)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_author_icon').setLabel('Autor — ikona: "bot" | URL').setStyle(TextInputStyle.Short).setValue(s.authorIcon ?? '').setRequired(false).setMaxLength(500)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_footer_text').setLabel('Stopka — tekst').setStyle(TextInputStyle.Short).setValue(s.footerText ?? '').setRequired(false).setMaxLength(2048)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_footer_icon').setLabel('Stopka — ikona: "bot" | URL').setStyle(TextInputStyle.Short).setValue(s.footerIcon ?? '').setRequired(false).setMaxLength(500)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('em_url').setLabel('URL tytułu (klikalny tytuł)').setStyle(TextInputStyle.Short).setValue(s.url ?? '').setRequired(false).setMaxLength(500)),
  );
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Edytuj Embed')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą edytować embedy.', flags: MessageFlags.Ephemeral });

    const msg = interaction.targetMessage;

    // Bot może edytować tylko własne wiadomości
    if (msg.author.id !== interaction.client.user.id)
      return interaction.reply({ content: '✕  Mogę edytować tylko własne wiadomości.', flags: MessageFlags.Ephemeral });

    if (!msg.embeds.length)
      return interaction.reply({ content: '✕  Ta wiadomość nie zawiera żadnego embeda.', flags: MessageFlags.Ephemeral });

    const s = {
      ...embedToSession(msg.embeds[0]),
      _messageId:  msg.id,
      _channelId:  msg.channelId,
    };
    save(interaction.user.id, s);

    // Od razu pokaż modal strona 1
    return interaction.showModal(modal1(s));
  },

  // ── Modal1 submit ─────────────────────────────────────────────────────────
  async handleModal1(interaction) {
    const s = get(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła. Kliknij "Edytuj Embed" ponownie.', flags: MessageFlags.Ephemeral });
    const updated = { ...s,
      title:       interaction.fields.getTextInputValue('em_title').trim()  || null,
      description: interaction.fields.getTextInputValue('em_desc').trim()   || null,
      color:       interaction.fields.getTextInputValue('em_color').trim()  || null,
      image:       interaction.fields.getTextInputValue('em_image').trim()  || null,
      thumbnail:   interaction.fields.getTextInputValue('em_thumb').trim()  || null,
    };
    save(interaction.user.id, updated);
    const preview = buildEmbed(updated, interaction.client.user);
    return interaction.reply({ content: '**Podgląd zmian** — zatwierdź lub edytuj dalej:', embeds: [preview], components: [previewRow()], flags: MessageFlags.Ephemeral });
  },

  // ── Modal2 submit ─────────────────────────────────────────────────────────
  async handleModal2(interaction) {
    const s = get(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła.', flags: MessageFlags.Ephemeral });
    const updated = { ...s,
      authorName: interaction.fields.getTextInputValue('em_author_name').trim() || null,
      authorIcon: interaction.fields.getTextInputValue('em_author_icon').trim() || null,
      footerText: interaction.fields.getTextInputValue('em_footer_text').trim() || null,
      footerIcon: interaction.fields.getTextInputValue('em_footer_icon').trim() || null,
      url:        interaction.fields.getTextInputValue('em_url').trim()         || null,
    };
    save(interaction.user.id, updated);
    const preview = buildEmbed(updated, interaction.client.user);
    return interaction.reply({ content: '**Podgląd zaktualizowany** — zatwierdź lub edytuj dalej:', embeds: [preview], components: [previewRow()], flags: MessageFlags.Ephemeral });
  },

  // ── Przycisk: strona 1 ────────────────────────────────────────────────────
  async handlePage1(interaction) {
    const s = get(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(modal1(s));
  },

  // ── Przycisk: strona 2 ────────────────────────────────────────────────────
  async handlePage2(interaction) {
    const s = get(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła.', flags: MessageFlags.Ephemeral });
    return interaction.showModal(modal2(s));
  },

  // ── Przycisk: zastosuj zmiany ─────────────────────────────────────────────
  async handleApply(interaction) {
    const s = get(interaction.user.id);
    if (!s) return interaction.reply({ content: '✕  Sesja wygasła.', flags: MessageFlags.Ephemeral });

    try {
      const ch = interaction.client.channels.cache.get(s._channelId)
              ?? await interaction.client.channels.fetch(s._channelId);
      const msg = await ch.messages.fetch(s._messageId);
      const embed = buildEmbed(s, interaction.client.user);
      await msg.edit({ embeds: [embed] });
      sessions.delete(interaction.user.id);
      return interaction.update({ content: `✓  Embed zaktualizowany w <#${s._channelId}>.`, embeds: [], components: [] });
    } catch (err) {
      console.error('[EMBED_EDIT] Błąd edycji:', err.message);
      return interaction.reply({ content: `✕  Nie mogłem zaktualizować wiadomości: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
