// repeats.js — manager powtarzających się wiadomości
const { EmbedBuilder } = require('discord.js');
const { COLOR, boFooter } = require('./design');
const { db } = require('./firebase');

const activeIntervals = new Map();

async function sendRepeat(client, repeat) {
  try {
    const channel = client.channels.cache.get(repeat.channelId)
                 ?? await client.channels.fetch(repeat.channelId).catch(() => null);
    if (!channel) {
      console.warn(`[REPEAT] Kanał ${repeat.channelId} nie znaleziony dla "${repeat.name}"`);
      return;
    }

    let payload;

    if (repeat.embedTitle) {
      // Tryb embed z tytułem
      const embed = new EmbedBuilder()
        .setColor(repeat.embedColor ? parseInt(repeat.embedColor.replace('#', ''), 16) : COLOR.RED)
        .setTitle(repeat.embedTitle)
        .setDescription(repeat.content)
        .setFooter(boFooter())
        .setTimestamp();
      payload = { embeds: [embed] };

    } else if (repeat.useEmbed) {
      // Tryb embed bez tytułu
      const embed = new EmbedBuilder()
        .setColor(repeat.embedColor ? parseInt(repeat.embedColor.replace('#', ''), 16) : COLOR.RED)
        .setDescription(repeat.content)
        .setFooter(boFooter())
        .setTimestamp();
      payload = { embeds: [embed] };

    } else {
      // Tryb plain text
      payload = { content: repeat.content };
    }

    await channel.send(payload);
    await db.collection('repeats').doc(repeat.id).update({ lastSentAt: new Date().toISOString() });
  } catch (err) {
    console.error(`[REPEAT] Błąd wysyłania "${repeat.name}":`, err.message);
  }
}

function startRepeat(client, repeat) {
  if (activeIntervals.has(repeat.id)) clearInterval(activeIntervals.get(repeat.id));
  const ms = Math.max((repeat.frequencyMinutes ?? 60) * 60 * 1000, 60_000);
  activeIntervals.set(repeat.id, setInterval(() => sendRepeat(client, repeat), ms));
  console.log(`[REPEAT] Uruchomiono: "${repeat.name}" co ${repeat.frequencyMinutes} min`);
}

function stopRepeat(repeatId) {
  if (activeIntervals.has(repeatId)) {
    clearInterval(activeIntervals.get(repeatId));
    activeIntervals.delete(repeatId);
  }
}

async function loadAllRepeats(client) {
  try {
    const snap = await db.collection('repeats').where('active', '==', true).get();
    snap.docs.forEach(doc => startRepeat(client, { id: doc.id, ...doc.data() }));
    console.log(`[REPEAT] Załadowano ${snap.size} aktywnych repeat(ów)`);
  } catch (err) {
    console.error('[REPEAT] Błąd ładowania:', err.message);
  }
}

module.exports = { startRepeat, stopRepeat, loadAllRepeats };
