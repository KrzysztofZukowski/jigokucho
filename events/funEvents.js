// events/funEvents.js — silnik eventów fun (kto pierwszy, quiz, zagadka)
const { Events, EmbedBuilder } = require('discord.js');
const { db }                   = require('../firebase');
const { COLOR, boAuthor, boFooter } = require('../design');
const RIDDLES = require('../data/riddles');

// ─── Stałe ─────────────────────────────────────────────────────────────────
const GENERAL_CH_ID  = '1408447648767414476';
const LOG_CH_ID      = '1489126727270662294';
const EVENT1_MAX_DAY = 3;               // maks "kto pierwszy" na dzień
const EVENT1_MIN_MS  = 60 * 60 * 1000;  // min 1h między event1
const EVENT1_MAX_MS  = 12* 60 * 60 * 1000; // maks 12h między event1
const EVENT_TIMEOUT  = 30 * 60 * 1000;  // 30 min na odpowiedź
const DAY_START_H    = 9;               // najwcześniej o 9:00
const DAY_END_H      = 21;              // najpóźniej o 21:00

// ─── Stan aktywnego eventu (in-memory) ────────────────────────────────────
let activeEvent = null;
// { type: 'first'|'image'|'riddle', messageId, correctAnswers, startedAt, timeout }

// ─── Firestore helpers ────────────────────────────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function getDailyState() {
  const ref = db.collection('eventDaily').doc(todayKey());
  const doc = await ref.get();
  if (doc.exists) return { ref, data: doc.data() };
  const defaults = {
    date: todayKey(),
    event1Count: 0,
    event1LastAt: null,
    event23Type: null,   // 'image' | 'riddle' | null
    event23Done: false,
  };
  await ref.set(defaults);
  return { ref, data: defaults };
}

async function updateDailyState(updates) {
  const ref = db.collection('eventDaily').doc(todayKey());
  await ref.set(updates, { merge: true });
}

// ─── Losuj czas zdarzenia w dzisiejszych godzinach ─────────────────────────
function randomTimeToday(fromNowMin = 0, fromNowMax = null) {
  const now       = new Date();
  const dayEnd    = new Date(now);
  dayEnd.setHours(DAY_END_H, 0, 0, 0);

  if (fromNowMax !== null) {
    // Losuj w przedziale od teraz
    const minMs  = fromNowMin;
    const maxMs  = Math.min(fromNowMax, dayEnd - now);
    if (maxMs <= minMs) return null;
    return minMs + Math.floor(Math.random() * (maxMs - minMs));
  }

  // Losuj w ramach dnia
  const dayStart = new Date(now);
  dayStart.setHours(DAY_START_H, 0, 0, 0);
  const from = Math.max(now, dayStart);
  const to   = dayEnd;
  if (to <= from) return null;
  const ms = from - now + Math.floor(Math.random() * (to - from));
  return ms > 0 ? ms : null;
}

// ─── Dodaj token graczowi ─────────────────────────────────────────────────
async function awardToken(userId, reason) {
  const ref = db.collection('levels').doc(userId);
  await db.runTransaction(async tx => {
    const doc     = await tx.get(ref);
    const current = Number(doc.data()?.tokens ?? 0);
    if (!doc.exists) {
      tx.set(ref, { userId, level: 0, xp: 0, totalXp: 0, tokens: 1, lastMessageAt: null });
    } else {
      tx.update(ref, { tokens: current + 1 });
    }
  });
  console.log(`[EVENTS] +1 Token dla ${userId} (${reason})`);
}

// ─── Sprawdź odpowiedź ────────────────────────────────────────────────────
function isCorrectAnswer(message, correctAnswers) {
  const text = message.content.toLowerCase().trim();
  return correctAnswers.some(ans => {
    const a = ans.toLowerCase().trim();
    // Dokładne dopasowanie ALBO tekst zawiera odpowiedź jako osobne słowo
    return text === a || text.split(/\s+/).includes(a);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// EVENTY
// ════════════════════════════════════════════════════════════════════════════

// ── EVENT 1: Kto pierwszy ────────────────────────────────────────────────
async function triggerEvent1(channel, skipCooldown = false) {
  const { ref, data } = await getDailyState();

  if (!skipCooldown) {
    if (data.event1Count >= EVENT1_MAX_DAY) {
      console.log('[EVENTS] Event1 limit osiągnięty');
      return false;
    }
    if (data.event1LastAt) {
      const sinceLastMs = Date.now() - new Date(data.event1LastAt).getTime();
      if (sinceLastMs < EVENT1_MIN_MS) {
        console.log('[EVENTS] Event1 cooldown aktywny');
        return false;
      }
    }
  }

  if (activeEvent) {
    console.log('[EVENTS] Inny event aktywny, pomijam event1');
    return false;
  }

  const msg = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.RED)
      .setAuthor(boAuthor('EVENT — KTO PIERWSZY'))
      .setTitle('⚡ Kto pierwszy odpowie, dostaje **1 Token**!')
      .setDescription('Odpowiedz na tę wiadomość jako pierwszy — token czeka!\n*Event wygasa po 30 minutach.*')
      .setFooter(boFooter())
      .setTimestamp()],
  });

  activeEvent = {
    type:      'first',
    messageId: msg.id,
    startedAt: Date.now(),
    timeout:   setTimeout(() => endEvent(channel, null, 'Czas minął — nikt nie odpowiedział.'), EVENT_TIMEOUT),
  };

  if (!skipCooldown) {
    await updateDailyState({
      event1Count:  (data.event1Count ?? 0) + 1,
      event1LastAt: new Date().toISOString(),
    });
  }

  console.log(`[EVENTS] Event1 uruchomiony (count: ${(data.event1Count ?? 0) + 1})`);
  return true;
}

// ── EVENT 2: Quiz ze zdjęciem ────────────────────────────────────────────
async function triggerEvent2(channel, skipCooldown = false) {
  const { data } = await getDailyState();

  if (!skipCooldown && data.event23Done) {
    console.log('[EVENTS] Event23 już dzisiaj');
    return false;
  }

  if (activeEvent) return false;

  // Pobierz losowe zdjęcie z Firestore
  const snap = await db.collection('quizImages').get();
  if (snap.empty) {
    console.log('[EVENTS] Brak zdjęć w bazie — pomijam event2');
    return false;
  }

  const docs  = snap.docs;
  const entry = docs[Math.floor(Math.random() * docs.length)].data();

  const msg = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.RED)
      .setAuthor(boAuthor('EVENT — KIM JEST TA POSTAĆ?'))
      .setTitle('🖼️ Rozpoznaj postać z Bleacha!')
      .setDescription('Pierwsza prawidłowa odpowiedź zdobywa **1 Token**!\n*Wystarczy imię LUB nazwisko. Event wygasa po 30 minutach.*')
      .setImage(entry.url)
      .setFooter(boFooter())
      .setTimestamp()],
  });

  activeEvent = {
    type:           'image',
    messageId:      msg.id,
    correctAnswers: entry.names, // string[] — lowercase fragmenty
    startedAt:      Date.now(),
    timeout:        setTimeout(() => endEvent(channel, null, `Czas minął! Postać to: **${entry.names[0]}**`), EVENT_TIMEOUT),
  };

  if (!skipCooldown) {
    await updateDailyState({ event23Type: 'image', event23Done: true });
  }

  console.log(`[EVENTS] Event2 (image quiz) uruchomiony — odpowiedź: ${entry.names[0]}`);
  return true;
}

// ── EVENT 3: Zagadka ─────────────────────────────────────────────────────
async function triggerEvent3(channel, skipCooldown = false) {
  const { data } = await getDailyState();

  if (!skipCooldown && data.event23Done) {
    console.log('[EVENTS] Event23 już dzisiaj');
    return false;
  }

  if (activeEvent) return false;

  // Losuj zagadkę (unikaj ostatnich 20)
  const usedDoc  = await db.collection('eventMeta').doc('usedRiddles').get();
  const usedIds  = usedDoc.exists ? (usedDoc.data().ids ?? []) : [];
  const available = RIDDLES.map((r, i) => i).filter(i => !usedIds.includes(i));
  const pool      = available.length > 0 ? available : RIDDLES.map((_, i) => i);
  const idx       = pool[Math.floor(Math.random() * pool.length)];
  const riddle    = RIDDLES[idx];

  // Zaktualizuj historię (ostatnie 20)
  const newUsed = [...usedIds, idx].slice(-20);
  await db.collection('eventMeta').doc('usedRiddles').set({ ids: newUsed });

  const msg = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.RED)
      .setAuthor(boAuthor('EVENT — ZAGADKA Z BLEACHA'))
      .setTitle('🧩 Odpowiedz na zagadkę!')
      .setDescription(`**${riddle.q}**\n\n💡 *Podpowiedź: ${riddle.hint}*\n\n*Pierwsza prawidłowa odpowiedź (1-2 słowa) zdobywa **1 Token**! Event wygasa po 30 minutach.*`)
      .setFooter(boFooter())
      .setTimestamp()],
  });

  activeEvent = {
    type:           'riddle',
    messageId:      msg.id,
    correctAnswers: riddle.answers,
    startedAt:      Date.now(),
    timeout:        setTimeout(() => endEvent(channel, null, `Czas minął! Odpowiedź to: **${riddle.answers[0]}**`), EVENT_TIMEOUT),
  };

  if (!skipCooldown) {
    await updateDailyState({ event23Type: 'riddle', event23Done: true });
  }

  console.log(`[EVENTS] Event3 (riddle) uruchomiony — idx: ${idx}, odpowiedź: ${riddle.answers[0]}`);
  return true;
}

// ── Zakończ event ─────────────────────────────────────────────────────────
async function endEvent(channel, winnerId, endMessage) {
  if (!activeEvent) return;
  clearTimeout(activeEvent.timeout);
  activeEvent = null;

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(winnerId ? COLOR.RED : 0x2e2e3f)
      .setDescription(
        winnerId
          ? `<@${winnerId}> zdobywa **1 Token**! 🏆`
          : endMessage ?? 'Event zakończony.'
      )
      .setFooter(boFooter())],
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════

let _client = null;

function scheduleEvent1() {
  const msDelay = randomTimeToday(EVENT1_MIN_MS, EVENT1_MAX_MS);
  if (!msDelay) return;
  setTimeout(async () => {
    const ch = _client?.channels?.cache?.get(GENERAL_CH_ID);
    if (!ch) return;
    const ok = await triggerEvent1(ch);
    if (ok) scheduleEvent1(); // zaplanuj następny
  }, msDelay);
  console.log(`[EVENTS] Następny event1 za ${Math.round(msDelay/60000)} min`);
}

async function scheduleDailyEvent23() {
  const { data } = await getDailyState();
  if (data.event23Done) return;

  // Wybierz typ (jeśli nie wybrany jeszcze)
  let type = data.event23Type;
  if (!type) {
    // Sprawdź czy są dostępne zdjęcia
    const hasImages = !(await db.collection('quizImages').limit(1).get()).empty;
    if (hasImages) {
      type = Math.random() < 0.5 ? 'image' : 'riddle';
    } else {
      type = 'riddle';
    }
    await updateDailyState({ event23Type: type });
  }

  const msDelay = randomTimeToday();
  if (!msDelay) return;

  setTimeout(async () => {
    const ch = _client?.channels?.cache?.get(GENERAL_CH_ID);
    if (!ch) return;
    if (type === 'image') await triggerEvent2(ch);
    else                  await triggerEvent3(ch);
  }, msDelay);

  console.log(`[EVENTS] Dzienny event (${type}) za ${Math.round(msDelay/60000)} min`);
}

function scheduleNextDayReset() {
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(0, 1, 0, 0); // 00:01
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ms = tomorrow - now;
  setTimeout(() => {
    scheduleDailyEvent23();
    scheduleEvent1();
    scheduleNextDayReset();
  }, ms);
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════

module.exports = function setupFunEvents(client) {
  _client = client;

  // Uruchom scheduler przy starcie
  scheduleDailyEvent23();
  scheduleEvent1();
  scheduleNextDayReset();

  // Nasłuchuj wiadomości na ogólnym
  client.on(Events.MessageCreate, async (message) => {
    if (message.channelId !== GENERAL_CH_ID) return;
    if (message.author.bot) return;
    if (!activeEvent) return;

    const ev = activeEvent;

    // ── Event 1: kto pierwszy ─────────────────────────────────────────────
    if (ev.type === 'first') {
      // Pierwsza wiadomość to wygrywający
      await awardToken(message.author.id, 'event1 — kto pierwszy');
      await endEvent(message.channel, message.author.id);
      return;
    }

    // ── Event 2 i 3: sprawdź odpowiedź ────────────────────────────────────
    if ((ev.type === 'image' || ev.type === 'riddle') && ev.correctAnswers) {
      if (isCorrectAnswer(message, ev.correctAnswers)) {
        await awardToken(message.author.id, `event ${ev.type}`);
        await endEvent(message.channel, message.author.id);
      }
    }
  });

  console.log('[EVENTS] System fun eventów aktywny');
};

// Eksport funkcji triggerujących do użycia przez komendę /events
module.exports.triggerEvent1 = triggerEvent1;
module.exports.triggerEvent2 = triggerEvent2;
module.exports.triggerEvent3 = triggerEvent3;
module.exports.getDailyState = getDailyState;
