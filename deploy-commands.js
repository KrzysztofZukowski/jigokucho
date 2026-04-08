// deploy-commands.js — rejestruje komendy w Discordzie
require('dotenv').config();

const path = require('node:path');
const fs   = require('node:fs');

// ─── Mock Firebase — zapobiega inicjalizacji gRPC ─────────────────────────
const firebasePath = path.join(__dirname, 'firebase.js');
require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath,
  loaded: true, exports: { db: null },
};
// ──────────────────────────────────────────────────────────────────────────

const { REST, Routes } = require('discord.js');

const commands     = [];
const commandsPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`[+] "${command.data.name}"`);
    }
  } catch (err) {
    console.warn(`[!] Pominięto ${file}: ${err.message}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\nRejestruję ${commands.length} komend(y)...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log(`\n✅ Zarejestrowano ${data.length} komend(y):`);
    data.forEach(cmd => console.log(`   "${cmd.name}"`));
  } catch (err) {
    console.error('\n❌ Błąd:', err.message ?? err);
  } finally {
    // ── Główna przyczyna UV_HANDLE_CLOSING na Windows ─────────────────────
    // discord.js używa undici (HTTP/1.1 + keep-alive) do REST API.
    // Po rest.put() undici trzyma otwarte połączenie TCP w puli.
    // process.exit() przerywa jego własny cleanup → libuv assertion crash.
    // Rozwiązanie: zniszczyć wszystkie połączenia undici PRZED wyjściem.
    try {
      const undici = require('undici');

      // 1. Globalny dispatcher (używany przez undici.fetch)
      await undici.getGlobalDispatcher?.()?.destroy?.();

      // 2. Wewnętrzny agent REST managera discord.js (jeśli istnieje)
      const agent = rest.requestManager?.agent
                 ?? rest.requestManager?.globalAgent
                 ?? rest.requestManager?.options?.agent;
      if (agent?.destroy) await agent.destroy();

    } catch (_) {
      // undici może być w innym miejscu lub niedostępny — ignoruj
    }

    // Krótka przerwa żeby event loop w pełni opróżnił kolejkę
    await new Promise(r => setTimeout(r, 150));
    process.exit(0);
  }
})();
