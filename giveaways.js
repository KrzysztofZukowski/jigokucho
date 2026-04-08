// giveaways.js — manager giveawayów
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { SEP, COLOR, boAuthor, boFooter } = require('./design');
const { db } = require('./firebase');

const activeTimeouts = new Map(); // giveawayId → timeoutHandle

// ─── Buduj embed giveawaya ────────────────────────────────────────────────
function buildGiveawayEmbed(giveaway, participantCount = 0, ended = false) {
  const endsTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const color  = ended ? 0x2e2e3f : COLOR.RED;

  const embed = new EmbedBuilder()
    .setAuthor(boAuthor(ended ? 'GIVEAWAY  ·  ZAKOŃCZONY' : 'GIVEAWAY'))
    .setColor(color)
    .setTitle(`✦  ${giveaway.prize}`)
    .addFields(
      { name: ended ? 'Zakończono' : 'Koniec',    value: `<t:${endsTs}:${ended ? 'F' : 'R'}>`, inline: true },
      { name: 'Liczba nagród',  value: String(giveaway.winnersCount ?? 1),             inline: true },
      { name: 'Uczestników',   value: String(participantCount),                         inline: true },
    )
    .setDescription(giveaway.opis ? `${giveaway.opis}\n${SEP}` : `${SEP}`)
    .setFooter(boFooter(ended ? 'Giveaway zakończony' : 'Dołącz do giveawaya poniżej'));

  if (giveaway.requirement) {
    embed.addFields({ name: 'Wymagania', value: giveaway.requirement, inline: false });
  }

  if (ended && giveaway.winners?.length) {
    embed.addFields({
      name: '✦  Zwycięzcy',
      value: giveaway.winners.map(id => `<@${id}>`).join('\n'),
      inline: false,
    });
  }

  return embed;
}

// ─── Przycisk Dołącz ──────────────────────────────────────────────────────
function buildJoinButton(giveawayId, count = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join__${giveawayId}`)
      .setLabel(`Dołącz  ·  ${count}`)
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Zakończ giveaway ─────────────────────────────────────────────────────
async function endGiveaway(client, giveawayId) {
  try {
    const gDoc = await db.collection('giveaways').doc(giveawayId).get();
    if (!gDoc.exists || !gDoc.data().active) return;

    const giveaway = { id: giveawayId, ...gDoc.data() };

    // Pobierz uczestników
    const partSnap = await db.collection('giveaways').doc(giveawayId)
      .collection('participants').get();
    const participants = partSnap.docs.map(d => d.id);

    // Losuj zwycięzców
    const winnersCount = giveaway.winnersCount ?? 1;
    const winners      = [];
    const pool         = [...participants];
    while (winners.length < winnersCount && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(idx, 1)[0]);
    }

    // Zaktualizuj Firestore
    await db.collection('giveaways').doc(giveawayId).update({
      active: false,
      winners,
      endedAt: new Date().toISOString(),
    });

    // Zaktualizuj wiadomość giveawaya
    const channel = client.channels.cache.get(giveaway.channelId)
                 ?? await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg) {
        const endedEmbed = buildGiveawayEmbed({ ...giveaway, winners }, participants.length, true);
        await msg.edit({ embeds: [endedEmbed], components: [] });
      }

      // Ogłoś zwycięzców
      if (winners.length > 0) {
        const winnersStr = winners.map(id => `<@${id}>`).join(', ');
        await channel.send({
          content: `✦  Gratulacje ${winnersStr}! Wygraliście **${giveaway.prize}**!`,
          embeds: [new EmbedBuilder()
            .setAuthor(boAuthor('GIVEAWAY  ·  WYNIKI'))
            .setColor(COLOR.RED)
            .setTitle(`✦  ${giveaway.prize}`)
            .addFields({ name: 'Zwycięzcy', value: winners.map(id => `<@${id}>`).join('\n') })
            .setDescription(`Łącznie wzięło udział: **${participants.length}** osób.`)
            .setFooter(boFooter())
            .setTimestamp()],
        });
      } else {
        await channel.send({
          content: `✕  Giveaway **${giveaway.prize}** zakończony — brak uczestników.`,
        });
      }
    }

    activeTimeouts.delete(giveawayId);
    console.log(`[GIVEAWAY] Zakończono: "${giveaway.prize}" (${winners.length} zwycięzców)`);
  } catch (err) {
    console.error(`[GIVEAWAY] Błąd kończenia ${giveawayId}:`, err.message);
  }
}

// ─── Zaplanuj zakończenie ─────────────────────────────────────────────────
function scheduleGiveaway(client, giveaway) {
  if (activeTimeouts.has(giveaway.id)) clearTimeout(activeTimeouts.get(giveaway.id));
  const remaining = new Date(giveaway.endsAt).getTime() - Date.now();
  if (remaining <= 0) {
    endGiveaway(client, giveaway.id);
    return;
  }
  const handle = setTimeout(() => endGiveaway(client, giveaway.id), remaining);
  activeTimeouts.set(giveaway.id, handle);
}

// ─── Załaduj aktywne giveawaye przy starcie ───────────────────────────────
async function loadAllGiveaways(client) {
  try {
    const snap = await db.collection('giveaways').where('active', '==', true).get();
    snap.docs.forEach(doc => scheduleGiveaway(client, { id: doc.id, ...doc.data() }));
    console.log(`[GIVEAWAY] Załadowano ${snap.size} aktywnych giveaway(ów)`);
  } catch (err) {
    console.error('[GIVEAWAY] Błąd ładowania:', err.message);
  }
}

module.exports = {
  buildGiveawayEmbed, buildJoinButton, scheduleGiveaway,
  endGiveaway, loadAllGiveaways,
};
