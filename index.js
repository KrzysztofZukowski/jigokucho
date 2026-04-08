// index.js
require('dotenv').config();

const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const fs   = require('node:fs');
const path = require('node:path');

const setupLogs            = require('./events/logs');
const setupVCMonitor       = require('./events/ticketvc');
const setupDisboard        = require('./events/disboard');
const setupLevels          = require('./events/levels');
const setupFunEvents       = require('./events/funEvents');
const { loadAllRepeats }   = require('./repeats');
const { loadAllGiveaways } = require('./giveaways');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // PRIVILEGED — włącz w Developer Portal
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ─── Załaduj komendy ────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[CMD] Załadowano: "${command.data.name}"`);
  }
}

// ─── Bot gotowy ─────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`\n✅ Zalogowano jako ${c.user.tag}`);
  console.log(`   Serwery: ${c.guilds.cache.size}  |  Komendy: ${client.commands.size}`);

  setupLogs(client);
  setupVCMonitor(client);
  setupDisboard(client);
  setupLevels(client);
  setupFunEvents(client);

  const ticketCmd = client.commands.get('ticket');
  if (ticketCmd?.loadActiveVCChannels) await ticketCmd.loadActiveVCChannels(client);

  await loadAllRepeats(client);
  await loadAllGiveaways(client);
  console.log('');
  c.user.setPresence({ status: 'online', activities: [{ name: 'Black Outpost RPG', type: 0 }] });
});

async function handleError(interaction, err, label) {
  console.error(`[ERR] ${label}:`, err);
  const msg = { content: '✕  Błąd podczas wykonywania akcji.', flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) await interaction.editReply(msg);
    else await interaction.reply(msg);
  } catch (_) {}
}

// ─── Interakcje ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── Slash + Context Menu ──────────────────────────────────────────────
  if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction); }
    catch (err) { await handleError(interaction, err, `"${interaction.commandName}"`); }
    return;
  }

  // ── Buttons ───────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const id = interaction.customId;
    try {
      if (id === 'rules_accept')           { await client.commands.get('rules')?.handleAccept(interaction);    return; }
      if (id.startsWith('ticket_open__'))  { await client.commands.get('ticket')?.handleTicketOpen(interaction);  return; }
      if (id.startsWith('ticket_close__')) { await client.commands.get('ticket')?.closeTicket(interaction);       return; }
      if (id === 'ticketvc_open')           { await client.commands.get('ticket')?.handleVCOpen(interaction);      return; }
      if (id.startsWith('giveaway_join__')){ await client.commands.get('giveaway')?.handleJoinButton(interaction); return; }
      if (id === 'embed_send')             { await client.commands.get('embed')?.handleSend(interaction);          return; }
      if (id === 'embed_page1')            { await client.commands.get('embed')?.handlePage1(interaction);         return; }
      if (id === 'embed_page2')            { await client.commands.get('embed')?.handlePage2(interaction);         return; }
      // embed_copy
      if (id === 'emcopy_edit1')           { await client.commands.get('Kopiuj Embed')?.handleEdit1(interaction);  return; }
      if (id === 'emcopy_edit2')           { await client.commands.get('Kopiuj Embed')?.handleEdit2(interaction);  return; }
      if (id === 'emcopy_send')            { await client.commands.get('Kopiuj Embed')?.handleSendPicker(interaction); return; }
      // walka / tura
      if (id.startsWith('tura_finalize__'))  { await client.commands.get('Kolejna Tura')?.handleFinalize(interaction);  return; }
      if (id.startsWith('tura_cancel__'))    { await client.commands.get('Kolejna Tura')?.handleCancel(interaction);    return; }
      // embed_edit
      if (id === 'emedit_page1')           { await client.commands.get('Edytuj Embed')?.handlePage1(interaction);  return; }
      if (id === 'emedit_page2')           { await client.commands.get('Edytuj Embed')?.handlePage2(interaction);  return; }
      if (id === 'emedit_apply')           { await client.commands.get('Edytuj Embed')?.handleApply(interaction);  return; }
    } catch (err) { await handleError(interaction, err, id); }
    return;
  }

  // ── Select Menus ──────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;
    const selectMap = {
      'tech_select':            ['techniki',  'handleSelect',       []],
      'item_select':            ['ekwipunek', 'handleSelect',       []],
      'passive_select':         ['pasywne',   'handleSelect',       []],
      'trait_delete_select':    ['traity',    'handleDeleteSelect',  []],
      'trait_edit_select':      ['traity',    'handleEditSelect',    []],
      'repeat_delete_select':   ['repeat',    'handleDeleteSelect',  []],
      'repeat_pause_select':    ['repeat',    'handlePauseSelect',   [client]],
      'repeat_edit_select':     ['repeat',    'handleEditSelect',    []],
      'giveaway_end_select':    ['giveaway',  'handleEndSelect',     []],
      'giveaway_reroll_select': ['giveaway',  'handleRerollSelect',  []],
      'ticketvc_slots':         ['ticket',    'handleVCSlots',       []],
      'tura_participant_select': ['Kolejna Tura', 'handleParticipantSelect', []],
      'walka_end_select':        ['walka',       'handleEndSelect',          []],
      'emcopy_channel_select':  ['Kopiuj Embed', 'handleChannelSelect', []],
    };
    const entry = selectMap[id];
    if (!entry) return;
    const [cmdName, handler, extras] = entry;
    try { await client.commands.get(cmdName)?.[handler](interaction, ...extras); }
    catch (err) { await handleError(interaction, err, id); }
    return;
  }

  // ── Modals ────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;
    try {
      if (id === 'ticket_setup_modal')        { await client.commands.get('ticket')?.handleTicketSetupModal(interaction); return; }
      if (id === 'ticketvc_setup_modal')      { await client.commands.get('ticket')?.handleVCSetupModal(interaction);     return; }
      if (id === 'embed_modal1')              { await client.commands.get('embed')?.handleModal1(interaction);             return; }
      if (id === 'embed_modal2')              { await client.commands.get('embed')?.handleModal2(interaction);             return; }
      if (id === 'emcopy_modal1')             { await client.commands.get('Kopiuj Embed')?.handleModal1(interaction);     return; }
      if (id === 'emcopy_modal2')             { await client.commands.get('Kopiuj Embed')?.handleModal2(interaction);     return; }
      if (id.startsWith('walka_setup_modal__'))  { await client.commands.get('walka')?.handleSetupModal(interaction);         return; }
      if (id.startsWith('tura_update_modal__'))  { await client.commands.get('Kolejna Tura')?.handleUpdateModal(interaction); return; }
      if (id === 'emedit_modal1')             { await client.commands.get('Edytuj Embed')?.handleModal1(interaction);     return; }
      if (id === 'emedit_modal2')             { await client.commands.get('Edytuj Embed')?.handleModal2(interaction);     return; }
      if (id.startsWith('repeat_add_modal__')){ await client.commands.get('repeat')?.handleAddModal(interaction, client); return; }
      if (id.startsWith('repeat_edit_modal__')){ await client.commands.get('repeat')?.handleEditModal(interaction, client);return; }
      if (id.startsWith('trait_edit_modal__')){ await client.commands.get('traity')?.handleEditModal(interaction);        return; }
    } catch (err) { await handleError(interaction, err, id); }
  }
});

client.login(process.env.DISCORD_TOKEN);