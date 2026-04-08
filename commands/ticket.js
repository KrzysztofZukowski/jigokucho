// commands/ticket.js — system ticketów i VC
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, MessageFlags,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { db }      = require('../firebase');
const { isAdmin } = require('../utils');
const { COLOR, boAuthor, boFooter } = require('../design');

// ─── Stałe ─────────────────────────────────────────────────────────────────
const ADMIN_ROLE_ID    = '1412154523463717114';
const ARCHIVE_CAT_ID  = '1489406171902120196';
const VERIFIED_ROLE_ID = '1489406831204896929';
const VC_EMPTY_MS      = 60 * 60 * 1000; // 1 godzina
const COOLDOWN_MS      = 60 * 60 * 1000; // 1 godzina cooldown na ticket

// ─── Globalny licznik ticketów ─────────────────────────────────────────────
async function nextTicketNumber() {
  const ref = db.collection('ticketMeta').doc('counter');
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const n   = (doc.exists ? doc.data().count : 0) + 1;
    tx.set(ref, { count: n });
    return n;
  });
}

// ─── Cooldown check — 1 ticket danego typu na godzinę ─────────────────────
async function checkCooldown(userId, type, guildId) {
  // Pobierz ostatnie 10 ticketów danego usera+typu — bez orderBy (brak indeksu)
  // Filtrowanie czasu w JS
  const snap = await db.collection('tickets')
    .where('openedBy', '==', userId)
    .where('type',     '==', type)
    .where('guildId',  '==', guildId)
    .limit(20).get();

  const cutoff = Date.now() - COOLDOWN_MS;
  const recent = snap.docs
    .map(d => d.data())
    .filter(d => d.openedAt && new Date(d.openedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));

  if (recent.length === 0) return null;
  return new Date(recent[0].openedAt).getTime() + COOLDOWN_MS;
}

// ─── Uprawnienia dla VC — zsynchronizowane z kategorią nadrzędną ──────────
async function vcPermissionOverwrites(guild, categoryId) {
  const category = categoryId
    ? guild.channels.cache.get(categoryId) ?? await guild.channels.fetch(categoryId).catch(() => null)
    : null;

  if (category?.permissionOverwrites?.cache?.size) {
    // Skopiuj z kategorii — VC dziedziczy
    return [...category.permissionOverwrites.cache.values()].map(ow => ({
      id:    ow.id,
      allow: ow.allow.toArray(),
      deny:  ow.deny.toArray(),
    }));
  }

  // Fallback gdy brak kategorii
  return [
    { id: guild.id,            deny:  [PermissionFlagsBits.ViewChannel] },
    { id: VERIFIED_ROLE_ID,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: ADMIN_ROLE_ID,       allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] },
  ];
}

// ─── Stwórz kanał tekstowy ticket ─────────────────────────────────────────
async function createTicketChannel(guild, interaction, config) {
  const { prefix, description, roleId } = config;
  const user = interaction.user;
  const num  = await nextTicketNumber();

  const channelName = `${prefix}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${num}`;
  const sourceChannel = interaction.channel;

  const permOverwrites = [
    { id: guild.id,            deny:  [PermissionFlagsBits.ViewChannel] },
    { id: user.id,             allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: ADMIN_ROLE_ID,       allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (roleId && roleId !== guild.id) {
    permOverwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channel = await guild.channels.create({
    name:   channelName,
    type:   ChannelType.GuildText,
    parent: sourceChannel.parentId ?? null,
    position: (sourceChannel.rawPosition ?? 0) + 1,
    permissionOverwrites: permOverwrites,
    reason: `Ticket #${num} — ${user.username}`,
  });

  await db.collection('tickets').doc(channel.id).set({
    channelId: channel.id, channelName, number: num,
    type: 'ticket', openedBy: user.id,
    openedAt: new Date().toISOString(), guildId: guild.id,
    active: true, prefix, roleId: roleId ?? null,
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close__${channel.id}`)
      .setLabel('Zamknij ticket').setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    embeds: [new EmbedBuilder()
      .setAuthor(boAuthor(`TICKET #${num}`)).setColor(COLOR.RED)
      .setDescription(description || 'Opisz swój problem, a nasz team wkrótce się odezwie.')
      .addFields(
        { name: 'Otworzył', value: `<@${user.id}>`, inline: true },
        { name: 'Zamknij',  value: 'Użyj przycisku poniżej lub `/ticket close`.', inline: false },
      ).setFooter(boFooter()).setTimestamp()],
    components: [closeRow],
  });

  return { channel, num };
}

// ─── Stwórz kanał VC ──────────────────────────────────────────────────────
async function createVCChannel(guild, interaction, slots) {
  const num          = await nextTicketNumber();
  const channelName  = `Ogólny ${num + 1}`;
  const categoryId   = interaction.channel.parentId ?? null;
  const permOverwrites = await vcPermissionOverwrites(guild, categoryId);

  const channel = await guild.channels.create({
    name:      channelName,
    type:      ChannelType.GuildVoice,
    parent:    categoryId,
    userLimit: slots,
    permissionOverwrites: permOverwrites,
    reason:    `VC tymczasowy #${num} — ${interaction.user.username}`,
  });

  await db.collection('tickets').doc(channel.id).set({
    channelId: channel.id, channelName, number: num,
    type: 'vc', openedBy: interaction.user.id,
    openedAt: new Date().toISOString(), guildId: guild.id,
    active: true, lastSeenEmpty: null,
  });

  return channel;
}

// ─── Załaduj aktywne VC przy starcie bota ─────────────────────────────────
async function loadActiveVCChannels(client) {
  try {
    const snap = await db.collection('tickets')
      .where('type', '==', 'vc').where('active', '==', true).get();

    let loaded = 0;
    for (const doc of snap.docs) {
      const data    = doc.data();
      const guild   = client.guilds.cache.get(data.guildId);
      if (!guild) continue;
      // Sprawdź czy kanał nadal istnieje
      const channel = guild.channels.cache.get(data.channelId)
                   ?? await guild.channels.fetch(data.channelId).catch(() => null);
      if (!channel) {
        // Kanał usunięty ręcznie — oznacz jako nieaktywny
        await db.collection('tickets').doc(doc.id).update({ active: false, deletedAt: new Date().toISOString() });
        continue;
      }
      // Jeśli pusty od startu — ustaw lastSeenEmpty na teraz jeśli nie było wcześniej
      if (channel.members?.size === 0 && !data.lastSeenEmpty) {
        await db.collection('tickets').doc(doc.id).update({ lastSeenEmpty: new Date().toISOString() });
      }
      loaded++;
    }
    console.log(`[VC] Załadowano ${loaded} aktywnych kanałów VC`);
  } catch (err) {
    console.error('[VC] Błąd ładowania:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Eksport komendy
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {

  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('System ticketów i tymczasowych kanałów VC')
    .addSubcommand(sub => sub.setName('setup').setDescription('[ADMIN] Skonfiguruj wiadomość z przyciskiem ticketu'))
    .addSubcommand(sub => sub.setName('vc').setDescription('[ADMIN] Skonfiguruj wiadomość z przyciskiem VC'))
    .addSubcommand(sub => sub.setName('close').setDescription('Zamknij bieżący ticket')),

  loadActiveVCChannels, // eksportuj do użycia w index.js
  VC_EMPTY_MS,

  // ── /ticket setup ────────────────────────────────────────────────────────
  // ── /ticket vc ───────────────────────────────────────────────────────────
  // ── /ticket close ─────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'close') return module.exports.closeTicket(interaction);

    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy.', flags: MessageFlags.Ephemeral });

    if (sub === 'setup') {
      const modal = new ModalBuilder().setCustomId('ticket_setup_modal').setTitle('Konfiguracja ticketów');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ts_title').setLabel('Tytuł embeda').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ts_desc').setLabel('Opis embeda').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ts_prefix').setLabel('Prefix nazwy kanału (np. "ticket")').setStyle(TextInputStyle.Short).setMaxLength(20).setPlaceholder('ticket').setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ts_role').setLabel('ID roli supportu (zostaw puste = tylko admin)').setStyle(TextInputStyle.Short).setMaxLength(30).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ts_btn').setLabel('Tekst przycisku').setStyle(TextInputStyle.Short).setMaxLength(80).setPlaceholder('Otwórz ticket').setRequired(true)),
      );
      return interaction.showModal(modal);
    }

    if (sub === 'vc') {
      const modal = new ModalBuilder().setCustomId('ticketvc_setup_modal').setTitle('Konfiguracja tymczasowych VC');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_title').setLabel('Tytuł embeda').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_desc').setLabel('Opis embeda').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_btn').setLabel('Tekst przycisku').setStyle(TextInputStyle.Short).setMaxLength(80).setPlaceholder('Utwórz kanał VC').setRequired(true)),
      );
      return interaction.showModal(modal);
    }
  },

  // ── Modal: ticket setup ──────────────────────────────────────────────────
  async handleTicketSetupModal(interaction) {
    const title  = interaction.fields.getTextInputValue('ts_title').trim();
    const desc   = interaction.fields.getTextInputValue('ts_desc').trim();
    const prefix = interaction.fields.getTextInputValue('ts_prefix').trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'ticket';
    const roleId = interaction.fields.getTextInputValue('ts_role').trim() || null;
    const btnTxt = interaction.fields.getTextInputValue('ts_btn').trim();

    // Zapisz konfigurację do Firestore — customId musi być ≤100 znaków
    const configRef = await db.collection('ticketConfigs').add({
      type:    'ticket',
      prefix,
      roleId:  roleId ?? null,
      desc:    desc || null,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
    });

    await interaction.reply({
      embeds: [new EmbedBuilder().setAuthor(boAuthor('TICKET')).setColor(COLOR.RED)
        .setTitle(title).setDescription(desc || '\u200b').setFooter(boFooter())],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_open__${configRef.id}`)  // tylko ID ≤ 28 znaków
          .setLabel(btnTxt).setStyle(ButtonStyle.Secondary),
      )],
    });
  },

  // ── Modal: VC setup ──────────────────────────────────────────────────────
  async handleVCSetupModal(interaction) {
    const title  = interaction.fields.getTextInputValue('tv_title').trim();
    const desc   = interaction.fields.getTextInputValue('tv_desc').trim();
    const btnTxt = interaction.fields.getTextInputValue('tv_btn').trim();

    await interaction.reply({
      embeds: [new EmbedBuilder().setAuthor(boAuthor('KANAŁ VC')).setColor(COLOR.RED)
        .setTitle(title).setDescription(desc || '\u200b').setFooter(boFooter())],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticketvc_open').setLabel(btnTxt).setStyle(ButtonStyle.Secondary),
      )],
    });
  },

  // ── Button: otwórz ticket ────────────────────────────────────────────────
  async handleTicketOpen(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Cooldown — 1 ticket na godzinę
    const cooldownUntil = await checkCooldown(interaction.user.id, 'ticket', interaction.guild.id);
    if (cooldownUntil) {
      const ts = Math.floor(cooldownUntil / 1000);
      return interaction.editReply({
        content: `✕  Możesz otworzyć kolejny ticket dopiero <t:${ts}:R>  *(cooldown: 1 godzina)*`,
      });
    }

    const parts    = interaction.customId.split('__');
    const configId = parts[1];

    // Pobierz konfigurację z Firestore
    let prefix = 'ticket', roleId = null, desc = '';
    if (configId) {
      const cfgDoc = await db.collection('ticketConfigs').doc(configId).get();
      if (cfgDoc.exists) {
        const cfg = cfgDoc.data();
        prefix  = cfg.prefix  ?? 'ticket';
        roleId  = cfg.roleId  ?? null;
        desc    = cfg.desc    ?? '';
      }
    }

    try {
      const { channel, num } = await createTicketChannel(interaction.guild, interaction, { prefix, description: desc, roleId });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.RED).setAuthor(boAuthor('TICKET OTWARTY'))
          .setDescription(`Twój ticket: <#${channel.id}>  (Ticket #${num})`)],
      });
    } catch (err) {
      console.error('[TICKET] Błąd:', err);
      return interaction.editReply({ content: `✕  Błąd tworzenia ticketu: ${err.message}` });
    }
  },

  // ── Button: otwórz VC — pokaż wybór slotów ──────────────────────────────
  async handleVCOpen(interaction) {
    // Cooldown — 1 VC na godzinę (osobny od ticket)
    const cooldownUntil = await checkCooldown(interaction.user.id, 'vc', interaction.guild.id);
    if (cooldownUntil) {
      const ts = Math.floor(cooldownUntil / 1000);
      return interaction.reply({
        content: `✕  Możesz utworzyć kolejny kanał VC dopiero <t:${ts}:R>  *(cooldown: 1 godzina)*`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const options = ['Bez limitu', 2, 3, 4, 5, 6, 8, 10, 15, 20].map((v, i) => ({
      label: String(v),
      value: String(i === 0 ? 0 : v),
    }));

    return interaction.reply({
      content: 'Wybierz liczbę miejsc na kanale VC:',
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ticketvc_slots').setPlaceholder('Liczba miejsc...')
          .addOptions(options.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value))),
      )],
      flags: MessageFlags.Ephemeral,
    });
  },

  // ── Select: sloty VC → stwórz kanał ─────────────────────────────────────
  async handleVCSlots(interaction) {
    await interaction.deferUpdate();
    const slots = parseInt(interaction.values[0]) || 0;
    try {
      const channel  = await createVCChannel(interaction.guild, interaction, slots);
      const limitStr = slots === 0 ? 'bez limitu' : `${slots} miejsc`;
      return interaction.editReply({
        content: `✓  Kanał <#${channel.id}> utworzony (${limitStr}). Zostanie usunięty po godzinie gdy będzie pusty.`,
        components: [],
      });
    } catch (err) {
      console.error('[VC] Błąd:', err);
      return interaction.editReply({ content: `✕  Błąd: ${err.message}`, components: [] });
    }
  },

  // ── Zamknij ticket ───────────────────────────────────────────────────────
  async closeTicket(interaction) {
    const channelId = interaction.channelId;
    const isBtn     = interaction.isButton?.();

    const ticketDoc = await db.collection('tickets').doc(channelId).get();
    if (!ticketDoc.exists || !ticketDoc.data().active) {
      const r = { content: '✕  Ten kanał nie jest aktywnym ticketem.', flags: MessageFlags.Ephemeral };
      return isBtn ? interaction.reply(r) : interaction.reply(r);
    }

    const ticket = ticketDoc.data();
    if (!isAdmin(interaction) && interaction.user.id !== ticket.openedBy) {
      const r = { content: '✕  Tylko osoba która otworzyła ticket lub administrator może go zamknąć.', flags: MessageFlags.Ephemeral };
      return isBtn ? interaction.reply(r) : interaction.reply(r);
    }

    if (isBtn) await interaction.deferUpdate().catch(() => {});
    else       await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) return;

      await channel.setParent(ARCHIVE_CAT_ID, { lockPermissions: false });
      await channel.permissionOverwrites.set([
        { id: interaction.guild.id,          deny:  [PermissionFlagsBits.ViewChannel] },
        { id: ADMIN_ROLE_ID,                 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ]);

      await db.collection('tickets').doc(channelId).update({
        active: false, closedBy: interaction.user.id, closedAt: new Date().toISOString(),
      });

      await channel.send({
        embeds: [new EmbedBuilder().setAuthor(boAuthor('TICKET ZAMKNIĘTY')).setColor(0x2e2e3f)
          .addFields(
            { name: 'Zamknął', value: `<@${interaction.user.id}>`,                   inline: true },
            { name: 'Czas',    value: `<t:${Math.floor(Date.now()/1000)}:F>`,         inline: true },
          ).setFooter(boFooter()).setTimestamp()],
      });

      await channel.setName(`zamknięty-${ticket.number ?? channelId.slice(-4)}`);
      if (!isBtn) interaction.editReply({ content: '✓  Ticket zamknięty.' });
    } catch (err) {
      console.error('[TICKET] Błąd zamykania:', err);
    }
  },
};
