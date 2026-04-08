// events/disboard.js — śledzenie bumpów Disboard + ochrona kanału
const { Events } = require('discord.js');
const { db }     = require('../firebase');

const DISBOARD_CHANNEL_ID = '1489082896080834571';
const DISBOARD_BOT_ID     = '302050872383242240';

// Znane frazy sukcesu bumpa (zależnie od wersji/języka bota Disboard)
const BUMP_SUCCESS_PHRASES = ['Bump done!', 'Podbito serwer!', 'Bumped!'];

function isSuccessfulBump(message) {
  if (message.author.id !== DISBOARD_BOT_ID) return false;
  const embeds = message.embeds ?? [];
  return embeds.some(e => {
    const desc = e.description ?? '';
    return BUMP_SUCCESS_PHRASES.some(phrase => desc.includes(phrase));
  });
}

module.exports = function setupDisboard(client) {

  // ── Przechwytuj wiadomości w kanale ──────────────────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    if (message.channelId !== DISBOARD_CHANNEL_ID) return;

    // ── Ochrona kanału — usuwaj wiadomości graczy bez loginu ──────────────
    if (!message.author.bot) {
      const linkDoc = await db.collection('discordLinks').doc(message.author.id).get().catch(() => null);
      if (!linkDoc?.exists) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(
          `<@${message.author.id}> Tylko gracze z przypisanym kontem Black Outpost mogą pisać na tym kanale.`
        ).catch(() => null);
        if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);
      }
      return;
    }

    // ── Wiadomości od Disboard bota ───────────────────────────────────────
    if (!isSuccessfulBump(message)) {
      console.log('[DISBOARD] Wiadomość od Disboard (nie success) — ignoruję');
      return;
    }

    // ── Udany bump — kto go zrobił? ───────────────────────────────────────
    // Wiadomość od Disboard jest odpowiedzią na interakcję /bump.
    // discord.js v14 udostępnia to przez:
    //   message.interactionMetadata?.user  (nowe API)
    //   message.interaction?.user          (starsze API, nadal działa)
    const bumperUser = message.interactionMetadata?.user
                    ?? message.interaction?.user
                    ?? null;

    if (!bumperUser) {
      console.log('[DISBOARD] Sukces bumpa ale nie można odczytać użytkownika z interakcji');
      console.log('[DISBOARD] interactionMetadata:', message.interactionMetadata);
      console.log('[DISBOARD] interaction:', message.interaction);
      return;
    }

    const bumperId = bumperUser.id;
    console.log(`[DISBOARD] Sukces bumpa od: ${bumperUser.username} (${bumperId})`);

    // Sprawdź login
    const linkDoc = await db.collection('discordLinks').doc(bumperId).get().catch(() => null);
    if (!linkDoc?.exists) {
      console.log(`[DISBOARD] ${bumperId} nie ma loginu — brak nagrody`);
      return;
    }

    const { identifier } = linkDoc.data();

    try {
      // Dodaj 1 token do levels/{bumperId}.tokens
      const levelRef = db.collection('levels').doc(bumperId);
      await db.runTransaction(async tx => {
        const doc     = await tx.get(levelRef);
        const current = Number(doc.data()?.tokens ?? 0);
        if (!doc.exists) {
          tx.set(levelRef, { userId: bumperId, level: 0, xp: 0, totalXp: 0, tokens: 1, lastMessageAt: null });
        } else {
          tx.update(levelRef, { tokens: current + 1 });
        }
      });

      console.log(`[DISBOARD] +1 Token dla ${bumperId} (${identifier})`);

      await message.channel.send(
        `<@${bumperId}> pomyślnie zbumpował serwer i otrzymał **1 Token**! 🦋`
      );

    } catch (err) {
      console.error('[DISBOARD] Błąd nagrody:', err.message);
    }
  });

  console.log('[DISBOARD] System bumpów aktywny');
};
