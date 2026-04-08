// deploy-safe.js — alternatywny skrypt deploy dla Windows
// Uruchamia deploy w osobnym procesie przez --exit flag Node.js
// Użyj: node deploy-safe.js
const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, 'deploy-commands.js')],
  {
    stdio: 'inherit',
    env: { ...process.env },
    // Daj procesowi max 30 sekund, potem zabij go
    timeout: 30_000,
  }
);

process.exit(result.status ?? 0);
