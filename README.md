# 🦋 Jigokuchō — Bot Discord dla Black Outpost

Bot discord.js v14 zintegrowany z Firebase Firestore.

---

## 📦 Instalacja

```bash
npm install
```

---

## ⚙️ Konfiguracja

1. Skopiuj `.env.example` → `.env` i uzupełnij dane.

### Skąd wziąć zmienne środowiskowe?

#### Discord
| Zmienna | Jak znaleźć |
|---|---|
| `DISCORD_TOKEN` | [Discord Developer Portal](https://discord.com/developers/applications) → Twoja aplikacja → **Bot** → Token |
| `CLIENT_ID` | Developer Portal → **General Information** → Application ID |
| `GUILD_ID` | W Discordzie: kliknij prawym na serwer → **Kopiuj ID serwera** (musisz mieć włączony tryb dewelopera) |

#### Firebase Admin SDK — Service Account
1. Idź do [Firebase Console](https://console.firebase.google.com) → Projekt `bleach-black-outpost`
2. Kliknij ⚙️ (koło zębate) → **Ustawienia projektu** → zakładka **Konta usługi**
3. Kliknij **Generuj nowy klucz prywatny** → pobierz plik JSON
4. Z tego pliku skopiuj:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (cały klucz łącznie z `-----BEGIN...-----END-----`)

#### Admin Role (opcjonalne)
- `ADMIN_ROLE_ID` — ID roli, którą mają admini na Discordzie
- Jeśli puste, bot sprawdza czy użytkownik ma uprawnienie **Administrator** na serwerze

---

## 🚀 Uruchomienie

### 1. Zarejestruj komendy (raz, po każdej zmianie komend)
```bash
node deploy-commands.js
```

### 2. Uruchom bota
```bash
node index.js
# lub z auto-restartem:
npx nodemon index.js
```

---

## 📋 Komendy

### `/login`
| Subkomenda | Opis | Kto może |
|---|---|---|
| `/login check` | Wyświetla twój identyfikator (prywatnie) | Wszyscy |
| `/login set @gracz identyfikator` | Przypisuje identyfikator do konta Discord | Admin |
| `/login remove @gracz` | Usuwa powiązanie identyfikatora | Admin |

### `/panel`
| Użycie | Opis | Kto może |
|---|---|---|
| `/panel` | Wyświetla twój własny panel postaci | Wszyscy |
| `/panel gracz:@ktoś` | Wyświetla panel innego gracza | Admin |

Panel pokazuje:
- Imię, rasa, ranga, pozycja
- Wszystkie statystyki bojowe (z nazwami zależnymi od rasy)
- Waluty (Reisen, Yen, Loyalty)
- Punkty PDR / NDR

---

## 🗄️ Struktura Firestore (co bot czyta/pisze)

```
discordLinks/{discordUserId}
  ├── identifier: "AkaIwa1234"
  ├── discordUsername: "username"
  ├── assignedBy: "adminDiscordId"
  └── assignedAt: "2026-..."

characters/{characterId}     ← tylko odczyt
  ├── identifier: "AkaIwa1234"
  ├── firstName, lastName, race, rank, position...
  ├── stats: { strength, vitality, ... }
  ├── reisenHand, reisenAbsorbed, ...
  └── pdr, ndr, ...
```

---

## 🔐 Uprawnienia bota (przy dodawaniu do serwera)

W Developer Portal → OAuth2 → URL Generator wybierz scope:
- ✅ `bot`
- ✅ `applications.commands`

Bot Permissions:
- ✅ Send Messages
- ✅ Use Slash Commands
- ✅ Read Message History (opcjonalnie)

---

## 📁 Struktura plików

```
jigokucho-bot/
├── index.js              ← główny plik
├── deploy-commands.js    ← rejestracja komend (uruchom raz)
├── firebase.js           ← połączenie z Firebase Admin
├── utils.js              ← pomocnicze funkcje
├── .env                  ← twoje klucze (NIE wgrywaj na GitHub!)
├── .env.example          ← szablon .env
├── package.json
└── commands/
    ├── login.js          ← /login
    └── panel.js          ← /panel
```
