// commands/rules.js
const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { isAdmin }                        = require('../utils');
const { COLOR, boAuthor, boFooter, IMG } = require('../design');

const VERIFIED_ROLE_ID = '1489406831204896929';
const GENERAL_CH_ID    = '1408447648767414476';
const INFO_CH_ID       = '1489425308808380416';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('[ADMIN] System akceptacji regulaminu')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('[ADMIN] Wyślij wiadomość z przyciskiem akceptacji regulaminu'),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '✕  Tylko administratorzy mogą używać tej komendy.', flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setAuthor(boAuthor('REGULAMIN'))
      .setColor(COLOR.RED)
      .setTitle('Zaakceptuj Regulamin')
      .setDescription(
        'Aby otrzymać rolę <@&' + VERIFIED_ROLE_ID + '> i uzyskać pełen dostęp do serwera, ' +
        'musisz zaakceptować regulamin i zobowiązać się do jego przestrzegania.\n\n' +
        'Klikając przycisk poniżej, potwierdzasz, że **w pełni zapoznałeś się z regulaminem** ' +
        'i zobowiązujesz się do jego przestrzegania. ' +
        'Po akceptacji otrzymasz pełen dostęp do serwera.'
      )
      .setFooter(boFooter('Black Outpost · Akceptacja regulaminu'))
      .setThumbnail(IMG.BO_LOGO);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rules_accept')
        .setLabel('Akceptuję Regulamin')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },

  // ── Obsługa przycisku akceptacji ──────────────────────────────────────
  async handleAccept(interaction) {
    const member = interaction.member;

    if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
      return interaction.reply({
        content: '✓  Masz już rolę Verified — regulamin został wcześniej zaakceptowany.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await member.roles.add(VERIFIED_ROLE_ID, 'Akceptacja regulaminu');

      // Ephemeral potwierdzenie dla gracza
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.RED)
          .setTitle('✓  Regulamin zaakceptowany')
          .setDescription(
            `Otrzymałeś rolę <@&${VERIFIED_ROLE_ID}> i pełen dostęp do serwera!\n\n` +
            `Zanim zaczniesz, przeczytaj koniecznie kanał <#${INFO_CH_ID}> — znajdziesz tam ważne informacje.\n\n` +
            `Jeśli nie widzisz wszystkich kanałów, kliknij prawym przyciskiem na nazwę serwera → **"Pokaż wszystkie kanały"** lub wejdź w **Kanały i Role** u góry listy kanałów.`
          )
          .setFooter(boFooter())],
        flags: MessageFlags.Ephemeral,
      });

      // Publiczna wiadomość powitalna na kanale ogólnym
      const generalCh = interaction.client.channels.cache.get(GENERAL_CH_ID)
                     ?? await interaction.client.channels.fetch(GENERAL_CH_ID).catch(() => null);

      if (generalCh) {
        await generalCh.send({
          embeds: [new EmbedBuilder()
            .setColor(COLOR.RED)
            .setAuthor(boAuthor('NOWY GRACZ'))
            .setDescription(
              `Witaj na Black Outpost, <@${interaction.user.id}>! 🦋\n\n` +
              `Zacznij od przeczytania kanału <#${INFO_CH_ID}> by poznać zasady i możliwości serwera.\n` +
              `Jeśli nie widzisz wszystkich kanałów — kliknij prawym na nazwę serwera → **"Pokaż wszystkie kanały"**.`
            )
            .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
            .setFooter(boFooter())
            .setTimestamp()],
        });
      }

    } catch (err) {
      console.error('[RULES] Błąd nadawania roli:', err.message);
      return interaction.reply({
        content: '✕  Błąd podczas nadawania roli. Skontaktuj się z administratorem.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
