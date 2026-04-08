// events/ticketvc.js — monitor pustych kanałów VC
const { Events } = require('discord.js');
const { db }     = require('../firebase');

const VC_EMPTY_MS = 60 * 60 * 1000; // 1 godzina
const CHECK_MS    = 5  * 60 * 1000; // sprawdzaj co 5 minut

module.exports = function setupVCMonitor(client) {

  // ── Śledź opuszczenie kanału ─────────────────────────────────────────────
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const channel = oldState.channel;
    if (!channel) return;

    const doc = await db.collection('tickets').doc(channel.id).get().catch(() => null);
    if (!doc?.exists || doc.data().type !== 'vc' || !doc.data().active) return;

    if (channel.members.size === 0) {
      await db.collection('tickets').doc(channel.id)
        .update({ lastSeenEmpty: new Date().toISOString() }).catch(console.error);
    } else {
      await db.collection('tickets').doc(channel.id)
        .update({ lastSeenEmpty: null }).catch(console.error);
    }
  });

  // ── Co 5 minut: usuń kanały puste od ≥1h ────────────────────────────────
  async function checkEmptyChannels() {
    try {
      const snap = await db.collection('tickets')
        .where('type', '==', 'vc').where('active', '==', true).get();
      const now = Date.now();

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (!data.lastSeenEmpty) continue;

        const emptyAt = new Date(data.lastSeenEmpty).getTime();
        if (now - emptyAt < VC_EMPTY_MS) continue;

        try {
          const guild   = client.guilds.cache.get(data.guildId);
          if (!guild) continue;
          const channel = guild.channels.cache.get(data.channelId)
                       ?? await guild.channels.fetch(data.channelId).catch(() => null);

          if (channel) {
            if ((channel.members?.size ?? 0) > 0) {
              // Ktoś dołączył w międzyczasie — reset
              await db.collection('tickets').doc(docSnap.id).update({ lastSeenEmpty: null });
              continue;
            }
            await channel.delete('VC pusty przez ≥1h');
            console.log(`[VC] Usunięto pusty kanał: ${data.channelName}`);
          }

          await db.collection('tickets').doc(docSnap.id).update({
            active: false, deletedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`[VC] Błąd usuwania ${data.channelId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[VC Monitor]', err.message);
    }
  }

  setInterval(checkEmptyChannels, CHECK_MS);
  // Sprawdź też od razu po starcie (mógł minąć czas gdy bot był wyłączony)
  setTimeout(checkEmptyChannels, 10_000);

  console.log('[VC Monitor] Aktywny');
};
