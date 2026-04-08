// commands/kolejna_tura.js — Context Menu: "Kolejna Tura"
const {
  ContextMenuCommandBuilder, ApplicationCommandType,
  EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { db }      = require('../firebase');
const { isAdmin } = require('../utils');
const { COLOR, boAuthor, boFooter } = require('../design');
const { buildCombatEmbed, postCombatEmbed, applyDelta, parseResourceChanges } = require('./walka');

// ─── Znajdź walkę po messageId ───────────────────────────────────────────
async function findCombat(messageId, guildId) {
  const snap = await db.collection('combats')
    .where('messageId', '==', messageId).where('active', '==', true).limit(1).get();
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  const snap2 = await db.collection('combats')
    .where('guildId', '==', guildId).where('active', '==', true).limit(1).get();
  return snap2.empty ? null : { id: snap2.docs[0].id, ...snap2.docs[0].data() };
}

// ─── Panel aktualizacji ───────────────────────────────────────────────────
function buildUpdateEmbed(combat, pendingUpdates) {
  const pending = Object.keys(pendingUpdates ?? {});
  const lines   = combat.participants.map((p, i) => {
    const check = pending.includes(String(i)) ? '**[v]**' : '[ ]';
    return `${check} **${p.name}** — HP ${p.hp.current}/${p.hp.max}, REI ${p.reiatsu.current}/${p.reiatsu.max}`;
  });
  return new EmbedBuilder()
    .setColor(COLOR.RED)
    .setAuthor(boAuthor(`TURA ${combat.turn} -> ${combat.turn + 1}`))
    .setTitle('Aktualizacja uczestnikow')
    .setDescription(
      `**[v]** = zaktualizowano  |  **[ ]** = auto regen\n\n${lines.join('\n')}\n\nWybierz uczestnika z listy lub kliknij **Zakoncz ture**.`
    )
    .setFooter(boFooter());
}

function buildButtons(combatId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tura_finalize__${combatId}`).setLabel('Zakoncz ture').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tura_cancel__${combatId}`).setLabel('Anuluj').setStyle(ButtonStyle.Secondary),
  );
}

function buildSelect(combat, combatId) {
  const options = combat.participants.map((p, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${i + 1}. ${p.name}`.slice(0, 100))
      .setValue(`${combatId}__${i}`)
      .setDescription(`HP: ${p.hp.current}/${p.hp.max}  REI: ${p.reiatsu.current}/${p.reiatsu.max}`.slice(0, 100))
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('tura_participant_select')
      .setPlaceholder('Wybierz uczestnika do aktualizacji...').addOptions(options)
  );
}

// ─── Modal aktualizacji ───────────────────────────────────────────────────
function buildModal(p, idx, combatId) {
  const autoRei = p.reiatsu.regen === null
    ? Math.round(p.reiatsu.max * 0.05 * 100) / 100
    : (p.reiatsu.regen ?? 0);

  const modal = new ModalBuilder()
    .setCustomId(`tura_update_modal__${combatId}__${idx}`)
    .setTitle(p.name.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('hp_change')
        .setLabel(`Health Points: ${p.hp.current}/${p.hp.max}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('-30, +10, =100 lub puste = bez zmian')
        .setRequired(false).setMaxLength(20)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('rei_change')
        .setLabel(`Reiatsu: ${p.reiatsu.current}/${p.reiatsu.max} (auto +${autoRei})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`-20, =0 lub puste = auto regen +${autoRei}`)
        .setRequired(false).setMaxLength(20)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('status_change')
        .setLabel('Status (puste = bez zmian)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder((p.status ?? 'Ok.').slice(0, 90))
        .setRequired(false).setMaxLength(200)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('resources_change')
        .setLabel('Zasoby (Nazwa=delta, jeden na linie)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Cero=-1\nMagia=+5\nNowyZasob=10/10')
        .setRequired(false).setMaxLength(500)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('regen_override')
        .setLabel('Regen tej tury: hp=X rei=Y (puste = domyslne)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`hp=${p.hp.regen ?? 0} rei=${autoRei}`)
        .setRequired(false).setMaxLength(40)
    ),
  );
  return modal;
}

function parseRegenOverride(text) {
  if (!text?.trim()) return {};
  const result = {};
  const hpM  = text.match(/hp\s*=\s*(-?\d+)/i);
  const reiM = text.match(/rei\s*=\s*(-?\d+)/i);
  if (hpM)  result.hp  = parseInt(hpM[1]);
  if (reiM) result.rei = parseInt(reiM[1]);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Kolejna Tura')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: 'Tylko administratorzy moga zarzadzac turami.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const combat = await findCombat(interaction.targetMessage.id, interaction.guild.id);
    if (!combat)
      return interaction.editReply({ content: 'Nie znaleziono aktywnej walki powiazanej z ta wiadomoscia.' });

    await db.collection('combats').doc(combat.id).update({ pendingUpdates: {} });

    return interaction.editReply({
      embeds:     [buildUpdateEmbed(combat, {})],
      components: [buildSelect(combat, combat.id), buildButtons(combat.id)],
    });
  },

  async handleParticipantSelect(interaction) {
    const [combatId, idxStr] = interaction.values[0].split('__');
    const idx = parseInt(idxStr);
    const doc = await db.collection('combats').doc(combatId).get();
    if (!doc.exists) return interaction.reply({ content: 'Walka nie istnieje.', flags: MessageFlags.Ephemeral });
    const combat = { id: doc.id, ...doc.data() };
    return interaction.showModal(buildModal(combat.participants[idx], idx, combatId));
  },

  async handleUpdateModal(interaction) {
    const parts    = interaction.customId.split('__');
    const combatId = parts[1];
    const idx      = parseInt(parts[2]);

    const doc = await db.collection('combats').doc(combatId).get();
    if (!doc.exists) return interaction.reply({ content: 'Walka nie istnieje.', flags: MessageFlags.Ephemeral });
    const combat = { id: doc.id, ...doc.data() };

    const update = {};
    const hp  = interaction.fields.getTextInputValue('hp_change').trim();
    const rei = interaction.fields.getTextInputValue('rei_change').trim();
    const st  = interaction.fields.getTextInputValue('status_change').trim();
    const res = interaction.fields.getTextInputValue('resources_change').trim();
    const reg = interaction.fields.getTextInputValue('regen_override').trim();

    if (hp)  update.hpChange      = hp;
    if (rei) update.reiChange     = rei;
    if (st)  update.status        = st;
    if (res) update.resources     = res;
    if (reg) update.regenOverride = reg;

    const pendingUpdates = { ...(combat.pendingUpdates ?? {}), [String(idx)]: update };
    await db.collection('combats').doc(combatId).update({ pendingUpdates });

    return interaction.reply({
      embeds:     [buildUpdateEmbed(combat, pendingUpdates)],
      components: [buildSelect(combat, combatId), buildButtons(combatId)],
      flags:      MessageFlags.Ephemeral,
    });
  },

  async handleFinalize(interaction) {
    await interaction.deferUpdate();
    const combatId = interaction.customId.split('__')[1];
    const doc      = await db.collection('combats').doc(combatId).get();
    if (!doc.exists) return;

    const combat  = { id: doc.id, ...doc.data() };
    const pending = combat.pendingUpdates ?? {};

    const newParticipants = combat.participants.map((p, i) => {
      const np  = JSON.parse(JSON.stringify(p));
      const upd = pending[String(i)];
      const autoRei = np.reiatsu.regen === null
        ? Math.round(np.reiatsu.max * 0.05 * 100) / 100
        : (np.reiatsu.regen ?? 0);

      if (upd) {
        const regenOvr = upd.regenOverride ? parseRegenOverride(upd.regenOverride) : {};

        // 1. Najpierw ręczne zmiany (obrażenia, leczenie etc.)
        if (upd.hpChange)  np.hp.current      = applyDelta(np.hp.current,      np.hp.max,      upd.hpChange);
        if (upd.reiChange) np.reiatsu.current  = applyDelta(np.reiatsu.current, np.reiatsu.max, upd.reiChange);
        if (upd.status)    np.status           = upd.status;

        if (upd.resources) {
          for (const chg of parseResourceChanges(upd.resources)) {
            if (chg.delta.includes('/')) {
              const [cur, max] = chg.delta.split('/').map(Number);
              const ex = np.resources.find(r => r.name.toLowerCase() === chg.name.toLowerCase());
              if (ex) { ex.current = cur; ex.max = max; }
              else np.resources.push({ name: chg.name, current: cur, max });
            } else {
              const ex = np.resources.find(r => r.name.toLowerCase() === chg.name.toLowerCase());
              if (ex) ex.current = applyDelta(ex.current, ex.max, chg.delta);
            }
          }
        }

        // 2. Potem regen (zawsze po ręcznych zmianach, chyba że override=0)
        const reiRegen = regenOvr.rei !== undefined ? regenOvr.rei : autoRei;
        const hpRegen  = regenOvr.hp  !== undefined ? regenOvr.hp  : np.hp.regen;
        if (reiRegen > 0) np.reiatsu.current = Math.min(np.reiatsu.max, np.reiatsu.current + reiRegen);
        if (hpRegen  > 0) np.hp.current      = Math.min(np.hp.max,      np.hp.current      + hpRegen);
      } else {
        // Brak ręcznych zmian — tylko auto regen
        if (autoRei          > 0) np.reiatsu.current = Math.min(np.reiatsu.max, np.reiatsu.current + autoRei);
        if (np.hp.regen      > 0) np.hp.current      = Math.min(np.hp.max,      np.hp.current      + np.hp.regen);
      }

      return np;
    });

    const newTurn       = combat.turn + 1;
    const updatedCombat = { ...combat, participants: newParticipants, turn: newTurn, pendingUpdates: {} };

    await db.collection('combats').doc(combatId).update({
      participants: newParticipants, turn: newTurn, pendingUpdates: {},
    });

    const channel = interaction.client.channels.cache.get(combat.channelId)
                 ?? await interaction.client.channels.fetch(combat.channelId);
    await postCombatEmbed(channel, updatedCombat, true); // true = nowa wiadomość, nie edytuj

    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR.RED).setAuthor(boAuthor('TURA ZAKONCZONA'))
        .setDescription(`Tura **${combat.turn}** -> **${newTurn}**. Regen zastosowany.`)
        .setTimestamp()],
      components: [],
    });
  },

  async handleCancel(interaction) {
    return interaction.update({ content: 'Anulowano.', embeds: [], components: [] });
  },
};
