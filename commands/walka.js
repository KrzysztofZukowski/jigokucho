// commands/walka.js — śledzenie HP/Reiatsu/statusów podczas walki
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, MessageFlags,
} = require('discord.js');
const { db }      = require('../firebase');
const { isAdmin } = require('../utils');
const { COLOR, boAuthor, boFooter } = require('../design');

const DEFAULT_REI_REGEN = 0.05;

// Formatuj liczbę: 1 → "1", 0.05 → "0.05", 4.50 → "4.5"
function fmtN(n) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

// ─── Formatowanie embeda — inline fields (poziome) ───────────────────────
function fieldValue(p) {
  const lines = [
    `HP  **${fmtN(p.hp.current)}** / ${fmtN(p.hp.max)}`,
    `REI **${fmtN(p.reiatsu.current)}** / ${fmtN(p.reiatsu.max)}`,
  ];
  for (const r of (p.resources ?? [])) {
    lines.push(`${r.name}  **${fmtN(r.current)}** / ${fmtN(r.max)}`);
  }
  const status = (p.status ?? 'Ok.').slice(0, 80);
  lines.push(`*${status}*`);
  return lines.join('\n');
}

function buildCombatEmbed(combat) {
  const title = combat.name
    ? `Tura ${combat.turn} — ${combat.name}`
    : `Tura ${combat.turn}`;

  const fields = combat.participants.map((p, i) => ({
    name:   `${i + 1}. ${p.name}${p.isNPC ? ' *(NPC)*' : ''}`.slice(0, 256),
    value:  fieldValue(p).slice(0, 1024),
    inline: true,
  }));

  // Discord pokazuje max 3 inline pola w rzędzie.
  // Jeśli liczba uczestników nie jest wielokrotnością 3,
  // dodaj puste pola żeby wyrównać ostatni rząd.
  const rem = fields.length % 3;
  if (rem !== 0) {
    for (let i = 0; i < 3 - rem; i++) {
      fields.push({ name: '\u200b', value: '\u200b', inline: true });
    }
  }

  return new EmbedBuilder()
    .setColor(COLOR.RED)
    .setAuthor(boAuthor('STAN WALKI'))
    .setTitle(title)
    .addFields(fields)
    .setFooter(boFooter('Prawy klik -> Kolejna Tura'))
    .setTimestamp();
}

// ─── Parser linii uczestnika ──────────────────────────────────────────────
// Formaty:
//   login                                   → gracz z bazy (wszystko z Firestore)
//   login|hp=80                             → gracz, nadpisz HP startowe
//   login|hp=80,rei=30,status=Ranny         → gracz, nadpisz kilka pól
//   login|rei=30,zasoby=Cero=5/5,efekt=X    → gracz, rei i zasoby
//   NPC:Nazwa:HP:REI                        → NPC custom
//   NPC:Nazwa:HP:REI:Cero=5/5,Magia=10/10  → NPC z zasobami
//   NPC:Nazwa:HP:REI::status=Szalony        → NPC ze statusem
//
// Dla graczy z bazy: hp i rei to wartości startowe (max zostaje z Firestore)
// Jeśli podasz hp bez rei — rei zostaje z Firestore i odwrotnie

function parseParticipantLine(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null; // komentarze

  // NPC
  if (t.toUpperCase().startsWith('NPC:')) {
    const rest  = t.slice(4);
    const cols  = rest.split(':');
    const name  = (cols[0] ?? 'NPC').trim();
    const hp    = parseInt(cols[1]) || 100;
    const rei   = parseInt(cols[2]) || 50;

    // Zasoby i status po trzecim dwukropku
    let resources = [];
    let status    = 'Ok.';

    let hpRegen = 0, reiRegen = null;
    const afterRei = cols.slice(3).join(':');
    if (afterRei) {
      const { resources: r, status: s, hpRegen: hr, reiRegen: rr } = parseExtras(afterRei);
      resources = r;
      if (s)          status   = s;
      if (hr != null) hpRegen  = hr;
      if (rr !== undefined) reiRegen = rr;
    }

    return { type: 'npc', name, hp, rei, resources, status, hpRegen, reiRegen };
  }

  // Gracz — może mieć nadpisania po '|'
  const [identifier, extrasStr] = t.split('|');
  const overrides = extrasStr ? parseOverrides(extrasStr) : {};
  return { type: 'login', identifier: identifier.trim(), overrides };
}

// Parser "hp=80,rei=30,status=Ranny,zasoby=Cero=5/5"
function parseOverrides(str) {
  const result = { hp: null, rei: null, hpRegen: null, reiRegen: null, status: null, resources: [] };
  const tokens = str.split(',');
  for (const token of tokens) {
    const eqIdx = token.indexOf('=');
    if (eqIdx < 0) continue;
    const key = token.slice(0, eqIdx).trim().toLowerCase();
    const val = token.slice(eqIdx + 1).trim();

    if (key === 'hp')                             result.hp       = parseInt(val) || null;
    else if (key === 'rei' || key === 'reiatsu')  result.rei      = parseInt(val) || null;
    else if (key === 'hpregen')                   result.hpRegen  = parseInt(val) ?? 0;
    else if (key === 'reiregen')                  result.reiRegen = val === 'auto' ? null : (parseInt(val) ?? null);
    else if (key === 'status')                    result.status   = val;
    else if (key === 'zasoby' || key === 'zasob') {
      const [rName, rVal] = val.split('=');
      if (rName && rVal) {
        const [cur, max] = rVal.split('/').map(Number);
        result.resources.push({ name: rName.trim(), current: cur || 0, max: max || cur || 0 });
      }
    }
  }
  return result;
}

// Parser zasobów i statusu z NPC.
// Format: "Cero=5/5,Hierro=100/100,status=Ranny"
// Klucz "status" traktowany specjalnie — nie jako zasób numeryczny.
function parseExtras(str) {
  const resources = [];
  let status = null, hpRegen = 0, reiRegen = null;
  for (const chunk of str.split(',')) {
    const eqIdx = chunk.indexOf('=');
    if (eqIdx < 0) continue;
    const name = chunk.slice(0, eqIdx).trim();
    const val  = chunk.slice(eqIdx + 1).trim();
    const key  = name.toLowerCase();
    if (key === 'status')   { status   = val; }
    else if (key === 'hpregen')  { hpRegen  = parseInt(val) || 0; }
    else if (key === 'reiregen') { reiRegen = val === 'auto' ? null : (parseInt(val) ?? null); }
    else if (name && !name.startsWith(':')) {
      const [cur, max] = val.split('/').map(Number);
      resources.push({ name, current: isNaN(cur) ? 0 : cur, max: isNaN(max) ? (isNaN(cur) ? 0 : cur) : max });
    }
  }
  return { resources, status, hpRegen, reiRegen };
}

// ─── Delta parser (+10, -30, =100) ───────────────────────────────────────
function applyDelta(current, max, input) {
  if (!input?.trim()) return current;
  const s = input.trim();
  if (s.startsWith('='))  return Math.max(0, Math.min(max, parseInt(s.slice(1)) || 0));
  if (s.startsWith('+'))  return Math.max(0, Math.min(max, current + (parseInt(s.slice(1)) || 0)));
  if (s.startsWith('-'))  return Math.max(0, current - (parseInt(s.slice(1)) || 0));
  const n = parseInt(s);
  if (!isNaN(n))          return Math.max(0, Math.min(max, n));
  return current;
}

function parseResourceChanges(text) {
  if (!text?.trim()) return [];
  return text.split(/\n/).map(s => {
    const eqIdx = s.indexOf('=');
    if (eqIdx < 0) return null;
    const name  = s.slice(0, eqIdx).trim();
    const delta = s.slice(eqIdx + 1).trim();
    return name && delta ? { name, delta } : null;
  }).filter(Boolean);
}

// ─── Buduj uczestników ─────────────────────────────────────────────────────
function makeParticipantFromChar(char, overrides = {}) {
  const vit     = char.stats?.vitality ?? 100;
  const rei     = char.stats?.reiatsu  ?? 50;
  const hpStart = overrides.hp  ?? vit;
  const reiStart= overrides.rei ?? rei;
  return {
    id:         char.id,
    name:       `${char.firstName ?? ''} ${char.lastName ?? ''}`.trim() || char.identifier,
    identifier: char.identifier,
    isNPC:      false,
    isCustom:   false,
    hp:      { current: hpStart, max: vit, regen: overrides.hpRegen  ?? 0 },
    reiatsu: { current: reiStart, max: rei, regen: overrides.reiRegen ?? null },
    resources: overrides.resources ?? [],
    status:    overrides.status    ?? 'Ok.',
  };
}

function makeParticipantFromNPC(data) {
  return {
    id:         `npc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name:       data.name,
    identifier: null,
    isNPC:      true,
    isCustom:   true,
    hp:      { current: data.hp,  max: data.hp,  regen: data.hpRegen  ?? 0 },
    reiatsu: { current: data.rei, max: data.rei, regen: data.reiRegen ?? null },
    resources: data.resources ?? [],
    status:    data.status    ?? 'Ok.',
  };
}

function applyRegen(participant) {
  const p = JSON.parse(JSON.stringify(participant));
  if (p.hp.regen > 0) p.hp.current = Math.min(p.hp.max, p.hp.current + p.hp.regen);
  const reiRegen = p.reiatsu.regen === null
    ? Math.round(p.reiatsu.max * DEFAULT_REI_REGEN * 100) / 100
    : (p.reiatsu.regen ?? 0);
  p.reiatsu.current = Math.min(p.reiatsu.max, p.reiatsu.current + reiRegen);
  return p;
}

// ─── Wyślij/zaktualizuj embed ─────────────────────────────────────────────
async function postCombatEmbed(channel, combat, newMessage = false) {
  const embed = buildCombatEmbed(combat);
  // Jeśli to nowa tura (newMessage=true) — zawsze nowa wiadomość
  // Jeśli to inicjalizacja (tura 1) — zawsze nowa wiadomość
  if (!newMessage && combat.messageId) {
    try {
      const msg = await channel.messages.fetch(combat.messageId);
      await msg.edit({ embeds: [embed] });
      return combat.messageId;
    } catch { /* wiadomość usunięta — wyślij nową */ }
  }
  const msg = await channel.send({ embeds: [embed] });
  return msg.id;
}

// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  data: new SlashCommandBuilder()
    .setName('walka')
    .setDescription('[ADMIN] System śledzenia walki — HP, Reiatsu, statusy')
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('[ADMIN] Rozpocznij nowe śledzenie walki')
      .addChannelOption(o => o.setName('kanał').setDescription('Kanał docelowy (domyślnie bieżący)').setRequired(false)
        .addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa walki').setRequired(false).setMaxLength(60))
    )
    .addSubcommand(sub => sub
      .setName('zakończ')
      .setDescription('[ADMIN] Zakończ aktywną walkę')
    ),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy.', flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const channel = interaction.options.getChannel('kanał') ?? interaction.channel;
      const name    = interaction.options.getString('nazwa')?.trim() ?? '';

      const sessionRef = await db.collection('combatSessions').add({
        channelId: channel.id, guildId: interaction.guild.id,
        name, createdBy: interaction.user.id,
        createdAt: new Date().toISOString(), status: 'setup',
      });

      const modal = new ModalBuilder()
        .setCustomId(`walka_setup_modal__${sessionRef.id}`)
        .setTitle('Walka — Uczestnicy');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('participants')
            .setLabel('Uczestnicy — jeden na linię')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('login\nlogin|hp=80,rei=30,status=Ranny\nNPC:Nazwa:HP:REI\nNPC:Nazwa:HP:REI:Zasób=cur/max')
            .setRequired(true).setMaxLength(2000)
        ),
      );
      return interaction.showModal(modal);
    }

    if (sub === 'zakończ') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const snap = await db.collection('combats')
        .where('guildId', '==', interaction.guild.id).where('active', '==', true).get();
      if (snap.empty) return interaction.editReply({ content: '✕  Brak aktywnych walk.' });

      if (snap.size === 1) {
        await db.collection('combats').doc(snap.docs[0].id).update({ active: false, endedAt: new Date().toISOString() });
        return interaction.editReply({ content: '✓  Walka zakończona.' });
      }

      const options = snap.docs.map(d => {
        const data = d.data();
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${data.name || 'Walka'} (tura ${data.turn})`)
          .setValue(d.id).setDescription(`<#${data.channelId}>`);
      });
      return interaction.editReply({
        content: 'Wybierz walkę do zakończenia:',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('walka_end_select')
            .setPlaceholder('Wybierz walkę...').addOptions(options)
        )],
      });
    }
  },

  async handleSetupModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sessionId = interaction.customId.split('__')[1];
    const rawLines  = interaction.fields.getTextInputValue('participants');

    const sessionDoc = await db.collection('combatSessions').doc(sessionId).get();
    if (!sessionDoc.exists)
      return interaction.editReply({ content: '✕  Sesja wygasła.' });

    const { channelId, guildId, name, createdBy } = sessionDoc.data();
    const lines       = rawLines.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const parsed      = lines.map(parseParticipantLine).filter(Boolean);
    const participants = [];
    const errors      = [];

    for (const p of parsed) {
      if (p.type === 'npc') {
        participants.push(makeParticipantFromNPC(p));
      } else {
        const snap = await db.collection('characters').where('identifier', '==', p.identifier).limit(1).get();
        if (snap.empty) {
          errors.push(`- Nie znaleziono: \`${p.identifier}\``);
        } else {
          participants.push(makeParticipantFromChar({ id: snap.docs[0].id, ...snap.docs[0].data() }, p.overrides ?? {}));
        }
      }
    }

    if (!participants.length)
      return interaction.editReply({ content: `✕  Brak uczestników.\n${errors.join('\n')}` });

    const combat = {
      guildId, channelId, name: name || null, turn: 1, active: true,
      createdBy, createdAt: new Date().toISOString(),
      participants, messageId: null,
    };

    const ref = await db.collection('combats').add(combat);
    combat.id = ref.id;

    const channel   = interaction.client.channels.cache.get(channelId)
                   ?? await interaction.client.channels.fetch(channelId);
    const messageId = await postCombatEmbed(channel, combat);
    await db.collection('combats').doc(ref.id).update({ messageId });
    await db.collection('combatSessions').doc(sessionId).delete();

    const warn = errors.length ? `\n\n**Błędy:**\n${errors.join('\n')}` : '';
    return interaction.editReply({ content: `✓  Walka na <#${channelId}> — ${participants.length} uczestników.${warn}` });
  },

  async handleEndSelect(interaction) {
    const id = interaction.values[0];
    await db.collection('combats').doc(id).update({ active: false, endedAt: new Date().toISOString() });
    return interaction.update({ content: '✓  Walka zakończona.', components: [] });
  },

  buildCombatEmbed,
  postCombatEmbed,
  applyDelta,
  applyRegen,
  parseResourceChanges,
};
