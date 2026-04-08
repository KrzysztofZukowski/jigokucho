// commands/roll.js — rzucanie kośćmi z animacją, wynik jako plain text
const { SlashCommandBuilder } = require('discord.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Spinner braille + bloki
const SPIN = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const D6   = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function spinChar(frame) { return SPIN[frame % SPIN.length]; }
function d6sym(n)        { return D6[n - 1]; }
function anyDie(sides)   { return Math.floor(Math.random() * sides) + 1; }

// ─── Parser notacji kości ─────────────────────────────────────────────────
function parseDice(input) {
  const clean  = input.replace(/\s/g, '').toLowerCase();
  const parts  = [];
  const tokens = clean.split(/(?=[+-])/).filter(Boolean);
  for (const token of tokens) {
    const sign = token.startsWith('-') ? -1 : 1;
    const t    = token.replace(/^[+-]/, '');
    const m    = t.match(/^(\d*)d(\d+)$/);
    if (m) {
      const count = parseInt(m[1] || '1'), sides = parseInt(m[2]);
      if (sides < 2 || sides > 10000 || count < 1 || count > 100) return null;
      parts.push({ type: 'dice', count, sides, sign });
    } else if (/^\d+$/.test(t)) {
      parts.push({ type: 'flat', value: parseInt(t), sign });
    } else {
      return null;
    }
  }
  return parts.length ? parts : null;
}

// ─── Wiersz animacji ──────────────────────────────────────────────────────
function animLine(parts, frame) {
  return parts.map((p, i) => {
    const prefix = i === 0 ? '' : (p.sign < 0 ? ' − ' : ' + ');
    if (p.type === 'flat') return `${prefix}**${p.value}**`;
    const dice = Array.from({ length: p.count }, () => {
      const roll = anyDie(p.sides);
      return p.sides === 6 ? d6sym(roll) : `[${roll}]`;
    }).join(' ');
    return `${prefix}\`${p.count}d${p.sides}\` ${dice}`;
  }).join('');
}

// ─── Rzuć i sformatuj wynik ───────────────────────────────────────────────
function rollFinal(parts, user, input) {
  const lines = [];
  let total   = 0;

  for (const [i, p] of parts.entries()) {
    const prefix = i === 0 ? '' : (p.sign < 0 ? ' − ' : ' + ');
    if (p.type === 'flat') {
      total += p.sign * p.value;
      lines.push(`${prefix}**+${p.value}**`);
    } else {
      const rolls = Array.from({ length: p.count }, () => anyDie(p.sides));
      const sum   = rolls.reduce((a, b) => a + b, 0) * p.sign;
      total += sum;
      const sym   = rolls.map(r => p.sides === 6 ? d6sym(r) : `[${r}]`).join(' ');
      const sumStr = p.count > 1 ? `  =  **${Math.abs(sum)}**` : '';
      lines.push(`${prefix}\`${p.count}d${p.sides}\` ${sym}${sumStr}`);
    }
  }

  // Natural max / Natural 1 dla pojedynczej kości
  const singleDice = parts.filter(p => p.type === 'dice');
  let suffix = '';
  if (singleDice.length === 1 && singleDice[0].count === 1) {
    const { sides } = singleDice[0];
    // Pobierz wynik z linii
    const rollVal = total - parts.filter(p => p.type === 'flat').reduce((a, p) => a + p.sign * p.value, 0);
    if (rollVal === sides)  suffix = '  ·  ✦ NATURAL MAX';
    if (rollVal === 1)      suffix = '  ·  ✕ NATURAL 1';
  }

  const sep     = '─────────────────────';
  const result  = [
    `**${user.username}** rzuca \`${input}\``,
    lines.join('\n'),
    sep,
    `**Suma: ${total}**${suffix}`,
  ].join('\n');

  return result;
}

// ─── Komenda ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Rzuć kośćmi — d10, 2d6, d8+d4, 3d6+2, d10−1, itd.')
    .addStringOption(opt =>
      opt.setName('kości').setDescription('Notacja: d10, 2d6, d8+d4, 3d6+2, d10-1').setRequired(true).setMaxLength(60),
    ),

  async execute(interaction) {
    const input = interaction.options.getString('kości').trim();
    const parts = parseDice(input);
    if (!parts) return interaction.reply({
      content: `✕  Nieprawidłowa notacja \`${input}\`.\nPrzykłady: \`d10\`, \`2d6\`, \`d8+d4\`, \`3d6+2\`, \`d10-1\``,
      flags: 64,
    });

    await interaction.deferReply(); // publiczna, nie ephemeral

    // ── Animacja: 3 klatki po ~550ms ────────────────────────────────────
    for (let frame = 0; frame < 3; frame++) {
      await interaction.editReply({
        content: `${spinChar(frame)} **${interaction.user.username}** rzuca \`${input}\`...\n${animLine(parts, frame)}`,
      });
      await sleep(550);
    }

    // ── Finał jako plain text ────────────────────────────────────────────
    await interaction.editReply({ content: rollFinal(parts, interaction.user, input) });
  },
};
