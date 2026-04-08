// events/levels.js — XP z wiadomości i VC, level-up, tokeny
const { Events, EmbedBuilder } = require('discord.js');
const { db }                   = require('../firebase');
const { boAuthor, boFooter, COLOR } = require('../design');

const LOG_CHANNEL_ID    = '1489126727270662294';
const XP_COOLDOWN_MS    = 60 * 1000;      // 1 minuta cooldown między XP za wiadomości
const VC_XP_INTERVAL    = 15;             // 1 XP per 15 minut VC
const VC_CHECK_MS       = 15 * 60 * 1000; // sprawdzaj co 15 minut

// In-memory: userId → joinedAt (Date)
const vcJoinTimes = new Map();

// ─── Formuła XP za wiadomość ──────────────────────────────────────────────
// Minimalna długość: 5 znaków → 0.1 XP
// Maksimum: 500+ znaków → 10 XP
function calcMessageXP(content) {
  const len = (content ?? '').trim().length;
  if (len < 5) return 0;
  const xp = Math.min(10, Math.max(0.1, len / 50));
  return Math.round(xp * 10) / 10;
}

// ─── Level / token helpers (importowane z lvl.js) ─────────────────────────
let _lvlCmd = null;
function lvlCmd() {
  if (!_lvlCmd) _lvlCmd = require('../commands/lvl');
  return _lvlCmd;
}

// ─── Dodaj XP gracza i obsłuż level-up ───────────────────────────────────
// fromMessage: czy XP pochodzi z wiadomości (→ wyślij powiadomienie ephem.)
// message: obiekt wiadomości Discord (potrzebny do reply)
async function addXP(userId, xpGain, fromMessage = false, message = null) {
  const { xpNeededForLevel, tokensForLevel } = lvlCmd();
  const ref = db.collection('levels').doc(userId);

  return db.runTransaction(async tx => {
    const doc  = await tx.get(ref);
    // Pobierz istniejące dane z domyślnymi wartościami — nigdy undefined
    const existing = doc.exists ? doc.data() : {};
    const level0   = Number(existing.level        ?? 0);
    const xp0      = Number(existing.xp           ?? 0);
    const totalXp0 = Number(existing.totalXp      ?? 0);
    const tokens0  = Number(existing.tokens       ?? 0);
    const lastMsg  = existing.lastMessageAt        ?? null;

    let level   = level0;
    let xp      = xp0 + xpGain;
    let totalXp = totalXp0 + xpGain;
    let tokens  = tokens0;

    const levelUps = [];

    // Sprawdź level-up
    while (xp >= xpNeededForLevel(level + 1)) {
      xp    -= xpNeededForLevel(level + 1);
      level += 1;
      levelUps.push(level);
    }

    // Zapisz — wszystkie pola mają gwarantowane wartości (nie undefined)
    tx.set(ref, {
      userId,
      level:         level,
      xp:            xp,
      totalXp:       totalXp,
      tokens:        tokens,
      lastMessageAt: lastMsg,
    }, { merge: true });

    return { level, xp, totalXp, tokens, levelUps };
  }).then(async ({ level, xp, totalXp, tokens, levelUps }) => {

    if (levelUps.length === 0) return;

    // Obsłuż każdy nowy poziom
    for (const newLevel of levelUps) {
      const tokenReward = tokensForLevel(newLevel);

      if (tokenReward > 0) {
        // Sprawdź czy gracz ma login
        const linkDoc = await db.collection('discordLinks').doc(userId).get().catch(() => null);

        if (linkDoc?.exists) {
          // Dodaj tokeny do bilansu
          await db.collection('levels').doc(userId).update({
            tokens: (tokens + tokenReward),
          });
          tokens += tokenReward;
        } else {
          // Brak loginu — zaloguj do kanału logów
          const logCh = message?.client?.channels?.cache?.get(LOG_CHANNEL_ID)
                     ?? await message?.client?.channels?.fetch(LOG_CHANNEL_ID).catch(() => null);
          if (logCh) {
            await logCh.send({
              embeds: [new EmbedBuilder()
                .setAuthor(boAuthor('TOKENY — BRAK LOGINU'))
                .setColor(0x4a4a64)
                .setDescription(
                  `<@${userId}> osiągnął poziom **${newLevel}** i powinien otrzymać **${tokenReward} Token(y)**,\n` +
                  `ale nie ma przypisanego konta Black Outpost.\n` +
                  `Tokeny **nie zostały przyznane** — gracz musi zgłosić się do administracji po stworzeniu postaci.`
                )
                .setTimestamp()],
            }).catch(() => {});
          }
        }
      }

      // Powiadomienie o level-up — tylko gdy XP pochodzi z wiadomości
      if (fromMessage && message) {
        const rewardMsg = tokenReward > 0
          ? (linkDoc?.exists ?? false)
            ? `\n+**${tokenReward}** Token(y) za parzysty poziom!`
            : `\n*(Tokeny zalogowane — brak przypisanego konta)*`
          : '';

        await message.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLOR.RED)
            .setTitle(`Poziom ${newLevel}! 🎉`)
            .setDescription(`Osiągnąłeś **poziom ${newLevel}**!${rewardMsg}`)
            .setFooter(boFooter())],
          flags: 64, // ephemeral
        }).catch(() => {});
      }
    }
  }).catch(err => {
    console.error('[LEVELS] addXP error:', err.message);
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────
module.exports = function setupLevels(client) {

  // ── XP za wiadomości ─────────────────────────────────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot)    return;
    if (!message.guild)        return;

    const xpGain = calcMessageXP(message.content);
    if (xpGain <= 0) return;

    // Cooldown — nie dajemy XP za każdą wiadomość z rzędu
    const ref = db.collection('levels').doc(message.author.id);
    const doc = await ref.get().catch(() => null);
    const lastMsg = doc?.data()?.lastMessageAt ? new Date(doc.data().lastMessageAt).getTime() : 0;

    if (Date.now() - lastMsg < XP_COOLDOWN_MS) return;

    // Zaktualizuj lastMessageAt i dodaj XP
    await ref.set({ lastMessageAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    await addXP(message.author.id, xpGain, true, message);
  });

  // ── XP za VC ─────────────────────────────────────────────────────────────
  // Śledź wejście/wyjście z kanałów VC
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const userId = oldState.member?.id ?? newState.member?.id;
    if (!userId) return;
    if (oldState.member?.user?.bot || newState.member?.user?.bot) return;

    const joinedChannel = !oldState.channel && newState.channel;
    const leftChannel   = oldState.channel  && !newState.channel;

    if (joinedChannel) {
      vcJoinTimes.set(userId, Date.now());
    }

    if (leftChannel && vcJoinTimes.has(userId)) {
      const joined   = vcJoinTimes.get(userId);
      vcJoinTimes.delete(userId);
      const minutes  = (Date.now() - joined) / 60_000;
      const xpGain   = Math.floor(minutes / VC_XP_INTERVAL);
      if (xpGain > 0) addXP(userId, xpGain, false, null); // silent — bez powiadomienia
    }
  });

  // ── Co 15 minut — XP dla aktywnych VC ────────────────────────────────────
  const VC_TICK_MS = VC_XP_INTERVAL * 60 * 1000;
  setInterval(() => {
    for (const [userId, joinedAt] of vcJoinTimes) {
      const minutesSoFar = (Date.now() - joinedAt) / 60_000;
      if (minutesSoFar >= VC_XP_INTERVAL) {
        // Przyznaj 1 XP i przesuń punkt startowy o 15 minut
        vcJoinTimes.set(userId, joinedAt + VC_TICK_MS);
        addXP(userId, 1, false, null);
      }
    }
  }, VC_CHECK_MS);

  console.log('[LEVELS] System poziomów aktywny');
};
