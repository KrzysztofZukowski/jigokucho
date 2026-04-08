// events/logs.js
const { EmbedBuilder, Events, AuditLogEvent, ChannelType } = require('discord.js');
const { boAuthor, boFooter } = require('../design');

const LOG_CHANNEL_ID = '1489126727270662294';
const FIELD_LIMIT    = 1020; // zostawiamy margines na "…"
const MSG_LIMIT      = 1990;

const CLR = { EDIT: 0x5090d0, DELETE: 0x8a1e1e, CREATE: 0x3a7a50 };

async function getLogChannel(client) {
  return client.channels.cache.get(LOG_CHANNEL_ID)
      ?? await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
}

async function fetchExecutor(guild, event, targetId = null) {
  try {
    await new Promise(r => setTimeout(r, 800));
    const logs  = await guild.fetchAuditLogs({ type: event, limit: 5 });
    const entry = logs.entries.find(e => {
      const recent  = Date.now() - e.createdTimestamp < 4000;
      const matches = targetId ? (e.target?.id === targetId || e.extra?.channel?.id === targetId) : true;
      return recent && matches;
    });
    return entry?.executor ?? null;
  } catch { return null; }
}

// Rozbij długi tekst na tablicę fragmentów ≤ limit znaków
function chunkText(text, limit = MSG_LIMIT) {
  if (!text || text.length === 0) return ['*brak treści*'];
  const chunks = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}

// Wyślij embed + ewentualne dodatkowe wiadomości z przepełnioną treścią
async function sendLog(log, embed, longTexts = []) {
  await log.send({ embeds: [embed] });
  // Każdy długi tekst wysyłamy jako osobne wiadomości (plain text w bloku kodu)
  for (const { label, text } of longTexts) {
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
      const header = chunks.length > 1 ? `**${label} (${i+1}/${chunks.length}):**\n` : `**${label}:**\n`;
      await log.send({ content: (header + '```\n' + chunks[i] + '\n```').slice(0, 2000) });
    }
  }
}

function channelTypeName(type) {
  const n = { [ChannelType.GuildText]:'Tekstowy', [ChannelType.GuildVoice]:'Głosowy',
    [ChannelType.GuildCategory]:'Kategoria', [ChannelType.GuildAnnouncement]:'Ogłoszenia',
    [ChannelType.GuildForum]:'Forum', [ChannelType.GuildStageVoice]:'Stage',
    [ChannelType.PublicThread]:'Wątek publiczny', [ChannelType.PrivateThread]:'Wątek prywatny',
  };
  return n[type] ?? `Typ ${type}`;
}
function ts(d) { return d ? `<t:${Math.floor(new Date(d).getTime()/1000)}:F>` : '—'; }
function tsR(d){ return d ? `<t:${Math.floor(new Date(d).getTime()/1000)}:R>` : '—'; }

// ─────────────────────────────────────────────────────────────────────────────
module.exports = function setupLogs(client) {

  // ── Wiadomość edytowana ─────────────────────────────────────────────────
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (newMsg.author?.bot || !newMsg.guild) return;
    const oldC = oldMsg.content || '';
    const newC = newMsg.content || '';
    if (oldC === newC) return;

    const log = await getLogChannel(client);
    if (!log) return;

    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('WIADOMOŚĆ  ·  EDYTOWANA'))
      .setColor(CLR.EDIT)
      .addFields(
        { name: 'Autor',      value: `${newMsg.author} \`${newMsg.author?.username}\``, inline: true },
        { name: 'Kanał',      value: `<#${newMsg.channelId}>`,                          inline: true },
        { name: 'Link',       value: `[→ przejdź](${newMsg.url})`,                      inline: true },
        { name: 'Wysłano',    value: ts(newMsg.createdAt),                              inline: true },
        { name: 'Edytowano',  value: tsR(new Date()),                                   inline: true },
      )
      .setFooter(boFooter()).setTimestamp();

    // Treści mogą być długie — daj skrót w embedzie, resztę w osobnych wiadomościach
    const longTexts = [];
    if (oldC.length <= FIELD_LIMIT) {
      embed.addFields({ name: 'Przed edycją', value: oldC || '*brak*' });
    } else {
      embed.addFields({ name: 'Przed edycją', value: oldC.slice(0, FIELD_LIMIT) + '…' });
      longTexts.push({ label: 'Przed edycją (pełna treść)', text: oldC });
    }
    if (newC.length <= FIELD_LIMIT) {
      embed.addFields({ name: 'Po edycji', value: newC || '*brak*' });
    } else {
      embed.addFields({ name: 'Po edycji', value: newC.slice(0, FIELD_LIMIT) + '…' });
      longTexts.push({ label: 'Po edycji (pełna treść)', text: newC });
    }

    sendLog(log, embed, longTexts).catch(console.error);
  });

  // ── Wiadomość usunięta ──────────────────────────────────────────────────
  client.on(Events.MessageDelete, async (msg) => {
    if (msg.author?.bot || !msg.guild) return;
    const log = await getLogChannel(client);
    if (!log) return;

    const executor = await fetchExecutor(msg.guild, AuditLogEvent.MessageDelete, msg.author?.id);
    const content  = msg.content || '';

    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('WIADOMOŚĆ  ·  USUNIĘTA'))
      .setColor(CLR.DELETE)
      .addFields(
        { name: 'Autor',     value: msg.author ? `${msg.author} \`${msg.author.username}\`` : '*nieznany*', inline: true },
        { name: 'Kanał',     value: `<#${msg.channelId}>`,                                                  inline: true },
        { name: 'Usunął',    value: executor ? `${executor} \`${executor.username}\`` : '*nieznany*',        inline: true },
        { name: 'Wysłano',   value: ts(msg.createdAt),                                                       inline: true },
        { name: 'Usunięto',  value: tsR(new Date()),                                                          inline: true },
      )
      .setFooter(boFooter()).setTimestamp();

    const longTexts = [];
    if (!content) {
      embed.addFields({ name: 'Treść', value: '*treść nieznana (sprzed uruchomienia bota)*' });
    } else if (content.length <= FIELD_LIMIT) {
      embed.addFields({ name: 'Treść', value: content });
    } else {
      embed.addFields({ name: 'Treść', value: content.slice(0, FIELD_LIMIT) + '…' });
      longTexts.push({ label: 'Pełna treść', text: content });
    }

    sendLog(log, embed, longTexts).catch(console.error);
  });

  // ── Kanał stworzony ─────────────────────────────────────────────────────
  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) return;
    const log = await getLogChannel(client); if (!log) return;
    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('KANAŁ  ·  STWORZONY')).setColor(CLR.CREATE)
      .addFields(
        { name: 'Kanał',     value: `${channel} \`#${channel.name}\``,                                     inline: true },
        { name: 'Typ',       value: channelTypeName(channel.type),                                          inline: true },
        { name: 'Stworzył',  value: executor ? `${executor} \`${executor.username}\`` : '*nieznany*',        inline: true },
        { name: 'Kiedy',     value: ts(new Date()),                                                          inline: true },
        ...(channel.parent ? [{ name: 'Kategoria', value: channel.parent.name, inline: true }] : []),
      ).setFooter(boFooter()).setTimestamp();
    log.send({ embeds: [embed] }).catch(console.error);
  });

  // ── Kanał usunięty ──────────────────────────────────────────────────────
  client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.guild) return;
    const log = await getLogChannel(client); if (!log) return;
    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('KANAŁ  ·  USUNIĘTY')).setColor(CLR.DELETE)
      .addFields(
        { name: 'Nazwa',     value: `\`#${channel.name}\``,                                                 inline: true },
        { name: 'Typ',       value: channelTypeName(channel.type),                                          inline: true },
        { name: 'Usunął',    value: executor ? `${executor} \`${executor.username}\`` : '*nieznany*',        inline: true },
        { name: 'Usunięto',  value: ts(new Date()),                                                          inline: true },
        ...(channel.parent ? [{ name: 'Kategoria', value: channel.parent.name, inline: true }] : []),
      ).setFooter(boFooter()).setTimestamp();
    log.send({ embeds: [embed] }).catch(console.error);
  });

  // ── Wątek stworzony ─────────────────────────────────────────────────────
  client.on(Events.ThreadCreate, async (thread) => {
    if (!thread.guild) return;
    const log = await getLogChannel(client); if (!log) return;
    const executor = await fetchExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('WĄTEK  ·  STWORZONY')).setColor(CLR.CREATE)
      .addFields(
        { name: 'Wątek',           value: `${thread} \`${thread.name}\``,                                  inline: true },
        { name: 'Kanał nadrzędny', value: thread.parentId ? `<#${thread.parentId}>` : '—',                 inline: true },
        { name: 'Stworzył',        value: executor ? `${executor} \`${executor.username}\`` : '*nieznany*', inline: true },
        { name: 'Kiedy',           value: ts(new Date()),                                                    inline: true },
      ).setFooter(boFooter()).setTimestamp();
    log.send({ embeds: [embed] }).catch(console.error);
  });

  // ── Wątek usunięty ──────────────────────────────────────────────────────
  client.on(Events.ThreadDelete, async (thread) => {
    if (!thread.guild) return;
    const log = await getLogChannel(client); if (!log) return;
    const executor = await fetchExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('WĄTEK  ·  USUNIĘTY')).setColor(CLR.DELETE)
      .addFields(
        { name: 'Nazwa',           value: `\`${thread.name}\``,                                             inline: true },
        { name: 'Kanał nadrzędny', value: thread.parentId ? `<#${thread.parentId}>` : '—',                 inline: true },
        { name: 'Usunął',          value: executor ? `${executor} \`${executor.username}\`` : '*nieznany*', inline: true },
        { name: 'Usunięto',        value: ts(new Date()),                                                    inline: true },
      ).setFooter(boFooter()).setTimestamp();
    log.send({ embeds: [embed] }).catch(console.error);
  });

  console.log('[LOGS] System logów aktywny');
};
