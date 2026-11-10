# Ki Aktien Helfer – Schritt-für-Schritt-Anleitung

Diese Anleitung erklärt alles von null. Nimm dir **etwa 1 Stunde** Zeit. Am besten am **Computer**, das Handy brauchst du für Telegram und am Ende für die App.

Hake jeden Schritt ab ☐ → ☑. Wenn etwas nicht klappt: Schau in „Hilfe bei Problemen“ ganz unten oder schreib mir im Claude-Projekt.

---

## Was du am Ende hast

| Teil | Was es macht |
|---|---|
| 📱 **Die App** | Auf deinem Handy-Startbildschirm. Zeigt Kurse (live), News, Prognosen, Depot, Finanzen, Kaufhilfe. |
| 🤖 **Der Telegram-Bot** | Schickt dir Alarme, Briefings und Erinnerungen. Du kannst ihm Befehle schreiben. |
| 💂 **Der Wachmann** | Ein kleines Programm bei GitHub. Läuft von selbst, auch wenn dein Handy aus ist. Prüft alle 5–15 Minuten die Kurse und steuert den Bot. |
| 🧠 **Claude** | Schreibt 3x am Tag (morgens, mittags, abends) die News-Zusammenfassungen und Einschätzungen. |

## Was du brauchst

- ☐ Einen Computer mit Internet
- ☐ Dein Handy mit der **Telegram**-App (kostenlos im App Store / Play Store)
- ☐ Die Datei **ki-aktien-helfer-app.zip** (hast du von mir bekommen)
- ☐ Einen Zettel oder eine Notiz-App, um **5 geheime Codes** aufzuschreiben

> ⚠️ **Wichtig:** Die Codes, die du gleich bekommst, sind wie Passwörter. Zeig sie niemandem und schick sie mir auch nicht im Chat.

### Deine Code-Liste (zum Ausfüllen)
| Name | Woher | Dein Code |
|---|---|---|
| TELEGRAM_TOKEN | Schritt 1 | |
| FINNHUB_KEY | Schritt 2 | |
| AV_KEY | Schritt 3 | |
| SYNC_PASSWORD | Schritt 4 (denkst du dir aus) | |
| TELEGRAM_CHAT | Schritt 8 | |
| GitHub-Schlüssel für die App | Schritt 10 | |

---

## Schritt 1: Deinen Telegram-Bot erstellen (5 Min.)

Ein Bot ist ein „Roboter-Kontakt“ in Telegram, der dir Nachrichten schickt.

1. Öffne **Telegram** auf dem Handy.
2. Tippe oben auf die **Suche** 🔍 und gib **BotFather** ein.
3. Wähle **@BotFather** (mit blauem Haken ✔️). Das ist der offizielle Bot zum Bot-Bauen.
4. Tippe unten auf **Start**.
5. Schreib: `/newbot` und schick es ab.
6. BotFather fragt nach einem **Namen**. Schreib z. B.: `Mein Aktien Helfer`
7. Dann fragt er nach einem **Benutzernamen**. Der muss auf **bot** enden und darf noch nicht vergeben sein. Z. B.: `tims_aktien_helfer_bot`
   - Wenn er „already taken“ sagt: anderen Namen probieren, z. B. mit einer Zahl.
8. BotFather antwortet mit einer langen Nachricht. Darin steht ein Code, der so aussieht:
   `7123456789:AAH4k...lange...Zeichenkette`
9. ✏️ Schreib diesen Code als **TELEGRAM_TOKEN** auf deine Liste. (Tipp: Lang drauf tippen → Kopieren.)

☐ Erledigt

---

## Schritt 2: Finnhub-Schlüssel holen (für Live-Kurse, 5 Min.)

1. Geh am Computer auf **finnhub.io**
2. Klick oben rechts auf **Get free API key** (oder **Sign up**).
3. Registriere dich mit E-Mail und Passwort und bestätige die E-Mail.
4. Nach dem Einloggen siehst du im **Dashboard** deinen **API Key** (eine Zeichenkette wie `cn1abc2def...`).
5. ✏️ Schreib ihn als **FINNHUB_KEY** auf.

☐ Erledigt

---

## Schritt 3: Alpha-Vantage-Schlüssel (für Kursverläufe und deutsche Aktien)

Du hast Alpha Vantage schon mit Claude verbunden. Für den Wachmann brauchst du den Schlüssel selbst:

1. Geh auf **alphavantage.co** → **Get Free API Key**.
2. Formular ausfüllen (bei „Which of the following best describes you?“ z. B. „Investor“) → **GET FREE API KEY**.
3. ✏️ Schreib den angezeigten Schlüssel als **AV_KEY** auf.

☐ Erledigt

---

## Schritt 4: Ein Sync-Passwort ausdenken

Mit diesem Passwort werden deine Depot- und Finanzdaten **verschlüsselt**, bevor sie zu GitHub gehen. Ohne das Passwort kann niemand sie lesen, auch nicht GitHub.

1. Denk dir ein Passwort aus: **mindestens 12 Zeichen**, z. B. drei Wörter mit Zahlen: `Tiger-Wolke-Pizza-42`
2. ✏️ Schreib es als **SYNC_PASSWORD** auf.

> ⚠️ Wenn du es vergisst, kann der Bot deine Depot-Daten nicht mehr lesen. Dann einfach ein neues ausdenken und in App und GitHub ändern.

☐ Erledigt

---

## Schritt 5: GitHub-Konto und Projekt anlegen (10 Min.)

GitHub ist der Ort, an dem deine App „wohnt“ und der Wachmann arbeitet.

### 5a. Konto erstellen
1. Geh auf **github.com** → **Sign up**.
2. E-Mail, Passwort und einen **Benutzernamen** wählen (z. B. `tim-greiner`). ✏️ Benutzernamen merken!
3. Das kleine Rätsel lösen, E-Mail-Code eingeben. Fragen nach Team/Plan: **Free** wählen, Rest überspringen.

### 5b. Projekt („Repository“) anlegen
1. Oben rechts auf **+** → **New repository**.
2. **Repository name:** `aktien-helfer`
3. **Public** auswählen (nötig, damit die App kostenlos online gehen kann).
4. Unten auf **Create repository**.

### 5c. Dateien hochladen
1. Entpacke die **ki-aktien-helfer-app.zip** auf deinem Computer (Doppelklick bzw. Rechtsklick → „Alle extrahieren“).
2. **Nur Mac:** Im entpackten Ordner einmal **Cmd + Shift + .** (Punkt) drücken, damit versteckte Ordner wie `.github` sichtbar werden.
3. In deinem neuen GitHub-Projekt auf den Link **uploading an existing file** klicken.
4. **Alle Dateien und Ordner** aus dem entpackten Ordner in das Browserfenster ziehen. Auch den Ordner **.github**, **bot** und **data**!
5. Warten, bis alle hochgeladen sind → unten **Commit changes** klicken.
6. Kontrolle: Im Projekt solltest du jetzt u. a. sehen: `.github`, `bot`, `data`, `index.html`, `app.js`, `ki.json`.

> Fehlt der Ordner `.github`? Dann siehe „Hilfe bei Problemen“ → Punkt A.

☐ Erledigt

---

## Schritt 6: Die geheimen Codes bei GitHub hinterlegen (5 Min.)

Der Wachmann braucht deine Codes. Bei GitHub heißen sie **Secrets**. Niemand kann sie sehen, auch nicht in einem öffentlichen Projekt.

1. In deinem Projekt oben auf **Settings** ⚙️ (ganz rechts in der Leiste).
2. Links: **Secrets and variables** → **Actions**.
3. Grüner Knopf **New repository secret**.
4. Bei **Name** genau so schreiben (Großbuchstaben!), bei **Secret** deinen Code einfügen, dann **Add secret**:

| Name | Secret |
|---|---|
| `TELEGRAM_TOKEN` | dein Code aus Schritt 1 |
| `FINNHUB_KEY` | dein Code aus Schritt 2 |
| `AV_KEY` | dein Code aus Schritt 3 |
| `SYNC_PASSWORD` | dein Passwort aus Schritt 4 |

5. Das 4-mal machen. Danach stehen 4 Einträge in der Liste.

☐ Erledigt

---

## Schritt 7: Den Wachmann einschalten (2 Min.)

1. Oben im Projekt auf **Actions** klicken.
2. Falls ein grüner Knopf **I understand my workflows, go ahead and enable them** erscheint: anklicken.
3. Links auf **Wachmann** klicken.
4. Rechts auf **Run workflow** → nochmal grünes **Run workflow**.
5. Nach ca. 1 Minute erscheint ein Eintrag mit **grünem Haken ✅**. Das heißt: Der Wachmann läuft.
   - Rotes ❌? Siehe „Hilfe bei Problemen“ → Punkt B.

> ℹ️ Ab jetzt startet der Wachmann **von selbst**: zu US-Börsenzeiten alle 5 Minuten, sonst alle 15 Minuten.

☐ Erledigt

---

## Schritt 8: Den Bot mit dir verbinden (5 Min.)

Der Bot muss wissen, wem er schreiben darf: nur dir.

1. Öffne in Telegram deinen Bot. Such dafür nach seinem Benutzernamen aus Schritt 1 (z. B. `tims_aktien_helfer_bot`).
2. Tippe auf **Start** (bzw. schreib `/start`).
3. Geh zurück zu GitHub → **Actions** → **Wachmann** → **Run workflow** (damit du nicht 15 Minuten warten musst).
4. Nach ca. 1 Minute schreibt dir der Bot: **„Deine Chat-ID ist: 123456789“**
5. ✏️ Schreib die Zahl als **TELEGRAM_CHAT** auf.
6. Bei GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `TELEGRAM_CHAT`, Secret: deine Zahl → **Add secret**
7. Nochmal **Actions** → **Wachmann** → **Run workflow**.
8. Schreib deinem Bot: `/hilfe`. Beim nächsten Lauf (oder nach einem weiteren „Run workflow“) antwortet er mit allen Befehlen. 🎉

☐ Erledigt

---

## Schritt 9: Die App online stellen (3 Min.)

1. Im Projekt: **Settings** → links **Pages**.
2. Bei **Branch**: `main` auswählen, daneben `/ (root)` → **Save**.
3. 1–2 Minuten warten, Seite neu laden. Oben steht dann:
   **Your site is live at https://DEINNAME.github.io/aktien-helfer/**
4. ✏️ Diesen Link aufschreiben.

☐ Erledigt

---

## Schritt 10: GitHub-Schlüssel für die App erstellen (5 Min.)

Damit deine App dein Depot (verschlüsselt) an den Wachmann schicken darf, braucht sie einen eigenen Schlüssel, der **nur für dieses eine Projekt** gilt.

1. Oben rechts auf dein **Profilbild** → **Settings** (diesmal die Einstellungen deines Kontos).
2. Links ganz unten: **Developer settings**.
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
4. Ausfüllen:
   - **Token name:** `Aktien Helfer App`
   - **Expiration:** **Custom** → ein Datum in 1 Jahr (✏️ im Kalender notieren: dann erneuern)
   - **Repository access:** **Only select repositories** → `aktien-helfer` auswählen
   - **Permissions** → **Repository permissions** → **Contents** → auf **Read and write** stellen
5. Ganz unten **Generate token**.
6. Der Schlüssel (beginnt mit `github_pat_…`) wird **nur einmal** angezeigt. ✏️ Sofort aufschreiben.

☐ Erledigt

---

## Schritt 11: App aufs Handy holen und einrichten (10 Min.)

### 11a. Als App auf den Startbildschirm
- **iPhone:** Link aus Schritt 9 in **Safari** öffnen → unten auf **Teilen** (Quadrat mit Pfeil ⬆️) → **Zum Home-Bildschirm** → **Hinzufügen**.
- **Android:** Link in **Chrome** öffnen → oben rechts **⋮** → **App installieren** (oder **Zum Startbildschirm hinzufügen**).

Jetzt ist ein grünes Symbol mit Pfeil auf deinem Startbildschirm. Ab jetzt die App **immer darüber** öffnen.

### 11b. Einstellungen (Zahnrad ⚙️ oben rechts)
1. **Dein Name** eintragen.
2. Farbe, Darstellung und Anleger-Typ nach Lust und Laune.
3. Bei **Daten und Aktualisierung**:
   - **Finnhub-Schlüssel:** Code aus Schritt 2
   - **Kurse aktualisieren alle:** 1 Minute
4. Bei **Abgleich mit GitHub**:
   - **Projekt:** `DEINNAME/aktien-helfer`
   - **GitHub-Schlüssel:** Code aus Schritt 10
   - **Sync-Passwort:** genau dasselbe wie in Schritt 4
5. Unter den Feldern muss jetzt **✓ Verbunden** stehen.
6. Bei **Telegram-Benachrichtigungen** aussuchen, was du bekommen willst.
7. Einstellungen mit **✕** schließen. Oben steht jetzt **● Live**.

☐ Erledigt

---

## Schritt 12: Deine Daten eintragen

1. **Depot:** Tab **Depot** → Aktie eintippen (wird erkannt) → Stück, Kaufpreis, Meldegrenze, Kursziel, Nachkauf-Tag → **Eintragen**. Wiederholen für alle Aktien.
2. **Finanzen:** Tab **Finanzen** → **Kontoauszug** (CSV aus deiner Banking-App laden) oder **Übersicht** → Einträge von Hand.
3. **Sparmodell:** Finanzen → **Sparmodell** → Empfehlung lesen → **Dieses Modell nutzen**.

Alles wird automatisch verschlüsselt an GitHub geschickt. Nach spätestens 15 Minuten kennt der Bot dein Depot. Test: Schreib ihm `/depot`.

☐ Erledigt

---

## Schritt 13: Claude für die KI-Updates einrichten (2 Min.)

Schreib mir im Claude-Projekt „Ki Aktien Helfer“ einfach:

> **„Richte die KI-Updates für mein Repository DEINNAME/aktien-helfer ein.“**

Ich verbinde mich dann mit deinem Projekt und lege 3 geplante Aufgaben an (ca. 7:40, 12:40 und 22:40 Uhr). Du musst den Zugriff einmal bestätigen.

☐ Erledigt

---

## ✅ Endkontrolle

| Test | So prüfst du es | Ergebnis |
|---|---|---|
| Wachmann läuft | GitHub → Actions: neue Einträge mit ✅ alle 5–15 Min. | ☐ |
| Bot antwortet | `/status` an den Bot → Antwort mit „✅ Alle Datenquellen erreichbar“ | ☐ |
| App live | Oben in der App „● Live“ | ☐ |
| Abgleich | ⚙️ → „✓ Verbunden“ | ☐ |
| Bot kennt Depot | `/depot` an den Bot | ☐ |
| KI-Update | Am nächsten Morgen kommt ein Briefing im Telegram | ☐ |

---

## So benutzt du alles im Alltag

- **Telegram** meldet sich von selbst. Am Ende jeder Nachricht stehen alle Befehle. Antippen genügt.
- **Antworten des Bots** kommen beim nächsten Lauf: tagsüber nach bis zu 5 Minuten, sonst nach bis zu 15 Minuten.
- **Nachtruhe 22–7 Uhr:** Nachrichten werden gesammelt und morgens geschickt. Ausnahme: Absturz über 10 %.
- **Kaufhilfe:** In der App unter **Finanzen → Kaufhilfe**, mit Beschreibung und Link zum Produkt. Alles in Bedenkzeit liegt im **Warenkorb** 🛒 oben neben dem Zahnrad (die Zahl zeigt, wie viel drin ist, rot = Bedenkzeit vorbei). Der Bot erinnert dich, wenn die Bedenkzeit vorbei ist, nach 2 Tagen nochmal, und sonntags kommt eine Übersicht. Unterwegs geht auch `/merken Jacke 120 7 https://link Größe M` an den Bot.
- **Sicherung:** Einmal im Monat in der App ⚙️ → **Sicherung speichern**.

### Alle Bot-Befehle
| Befehl | Was passiert |
|---|---|
| `/hilfe` | Alle Befehle mit Erklärung |
| `/kurs AAPL` | Aktueller Kurs und Trend |
| `/depot` | Dein Depot mit Gewinn/Verlust |
| `/top` | Gewinner und Verlierer heute |
| `/markt` | Indizes und Branchen |
| `/news` | Wichtigste Nachrichten |
| `/briefing` | Letztes Briefing nochmal |
| `/prognose NVDA` | Trend und erwarteter Bereich |
| `/termine` | Anstehende Termine |
| `/kaufhilfe` | Dein Warenkorb mit Knöpfen „Kaufen“ / „Will ich nicht mehr“ |
| `/merken Jacke 120 7` | Kauf 7 Tage auf Bedenkzeit setzen, optional mit Link und Beschreibung dahinter |
| `/gespart` | Was dir die Kaufhilfe gespart hat |
| `/ziel` | Fortschritt deines Sparziels |
| `/sparmodell` | Dein Modell und die Empfehlung |
| `/alarme` | Deine Alarm-Regeln |
| `/warnung` | Frühwarn-Ampel für deine Werte |
| `/analyse` | Deine Werte: wie sicher, warum genau, Zukunft und Alternativen mit Begründung (`/analyse SAP` für einen einzelnen Wert) |
| `/rueckblick` | Kaufrückblick: wie gut waren deine Entscheidungen? |
| `/ruhe 2h` | Pause (auch `30m` oder `morgen`) |
| `/laut` | Pause beenden |
| `/status` | Läuft alles? |

---

## Europa-Kurse
- **Woher:** Der Wachmann holt Kurse von Xetra und anderen europäischen Börsen bei Yahoo Finance (kostenlos, ohne Schlüssel, ca. 15 Minuten verzögert). Während Xetra offen ist (9:00–17:30 Uhr) alle 5 Minuten, sonst stündlich.
- **In der App:** Markt zeigt DAX, MDAX, Euro Stoxx 50, FTSE 100, CAC 40 und europäische Branchen. Unter Aktien gibt es den Filter „Europa / USA“.
- **Deutsche Aktien eintragen:** Einfach den Namen tippen (z. B. „Siemens“). Kürzel enden auf **.DE** (Xetra), Preise sind in **€**.
- **Depot-Summe** wird in Euro angezeigt, Dollar-Werte werden umgerechnet.
- **Bot:** `/kurs Siemens`, `/markt` zeigt Europa und USA.
- Yahoo Finance ist eine inoffizielle Quelle. Fällt sie aus, meldet `/status` das.

## Frühwarnungen
Der Bot warnt, **bevor** ein Wert stark gefallen ist, unabhängig von deinem Kaufpreis. Er achtet auf:
- Trendbruch (Kurs rutscht unter den 20- und 50-Tage-Durchschnitt)
- Plötzlich stärkere Schwankungen
- Wachsender Abstand zum 3-Monats-Hoch
- Mehrere Verlusttage in Folge
- Quartalszahlen in den nächsten 2 Tagen
- Negative Nachrichtenlage (KI-Einschätzung)
- Nervöser Gesamtmarkt (Angst-Barometer VIX über 25 bzw. 30)

Ampel: 🟩 unauffällig · 🟨 erhöht · 🟥 hoch. Eine Nachricht kommt, wenn ein Wert aus Depot oder Beobachtung auf Gelb oder Rot springt. `/warnung` zeigt die Ampel für alle deine Werte. Frühwarnungen sind Hinweise, keine Verkaufssignale. Fehlalarme kommen vor.

## Krypto und Alternativen
- Bitcoin, Ethereum, Solana, XRP, BNB, Cardano und Dogecoin in Euro, rund um die Uhr aktualisiert.
- Unter **Aktien → Alternativen zum MSCI World**: Bausteine mit weniger USA, Europa, Schwellenländer, defensivere ETFs, Anleihen, Geldmarkt und Gold, jeweils mit Erklärung.

## Verkaufen, Nachkaufen, Test-Einträge
Im Depot bei jeder Position auf **Ändern ›** tippen:
- **Verkaufen:** ganz oder teilweise. Der Gewinn oder Verlust wird unter „Realisiert“ gespeichert, die Liste steht unten unter „Verkäufe“.
- **Nachkaufen:** Der Durchschnittspreis wird automatisch neu berechnet.
- **Bearbeiten:** Tippfehler korrigieren.
- **Als Test markieren:** Der Eintrag bleibt sichtbar, zählt aber nicht in Gewinn und Verlust. Beim Eintragen gibt es dafür auch das Häkchen „Nur zum Ausprobieren“.
- **Löschen:** für Einträge, die du nie wirklich gekauft hast. Es wird kein Verkauf gespeichert, deine Bilanz bleibt sauber.
- Ein falsch eingetragener Verkauf lässt sich unter „Verkäufe“ löschen.

## Zusammensetzung des Depots
Im Depot oben: Kuchendiagramm nach **Positionen**, **Art** (ETF, Einzelaktie, Krypto, Gold, Anleihen) oder **Region** (USA, Europa, Schwellenländer …). Tippe auf ein Stück für Details. Darunter:
- Anteil ETFs zu Einzelaktien, USA-Anteil (bei ETFs ungefähr gerechnet), größte Position
- **Gewichtungs-Check** gegen Faustregeln für deinen Anleger-Typ (vorsichtig, ausgewogen, mutig; änderbar unter ⚙️)
- **Kritisch:** Werte mit Frühwarnung oder zu großem Anteil einer einzelnen Firma
- **Könnte ergänzen:** passende Bausteine für Lücken, z. B. Schwellenländer, Europa oder Anleihen
Test-Einträge zählen nicht mit. Alles sind Faustregeln, keine Anlageberatung.

## Risiko, Anlagedauer und „Was steckt drin?“
- Jede Seite zeigt oben auf einen Blick: **Risiko** (niedrig, mittel, hoch), **Anlagedauer** (kurzfristig, langfristig, spekulativ oder nicht kaufbar), **Trend** und **Frühwarnung**. Im Depot steht das auch bei jeder Position, dazu das Gesamtrisiko deines Depots.
- Bei Indizes, Angst-Barometer, Gold- und Ölpreis sowie Euro/Dollar erklärt **„Was steckt drin?“** den Wert, zeigt große enthaltene Firmen und **womit du investieren kannst** (z. B. DAX → iShares Core DAX ETF). Beim VIX gibt es stattdessen Stoßdämpfer für unruhige Zeiten.

## Einschätzungen und Quellen
- **Ausführlich** (Begründung, Pro/Contra, Anlagedauer, Warnstufe): alles in deinem Depot und was du aktiv beobachtest.
- **Kurz** (2 Sätze, Anlagedauer, Warnstufe): bis zu 20 Werte insgesamt, ausgewählt nach deinen Interessen. Was du oft ansiehst, steigt auf. Was du lange nicht ansiehst, fällt raus. Am Anfang: DAX, S&P 500, MSCI World, VIX, Gold, Bitcoin, Euro/Dollar, FTSE All-World.
- **Auf Anfrage:** Auf jeder Seite ohne Einschätzung gibt es den Knopf „KI-Einschätzung anfordern“. Ohne API-Schlüssel kommt sie beim nächsten KI-Update (7:00 oder 12:40 Uhr), mit API-Schlüssel nach ca. 2 Minuten (siehe unten).
- **Ruhen:** Beobachtete Werte, die du 30 Tage nicht angesehen hast, werden nicht mehr bewertet, bleiben aber in der Liste. Einmal ansehen weckt sie wieder.
- Jede Seite hat unten **Quellen**: die genutzten Meldungen (antippbar) und die Kursdaten-Quelle.
- Unter ⚙️ → „KI-Einschätzungen“ siehst du, welche Werte gerade bewertet werden.

### Optional: Einschätzung in 2 Minuten (eigener API-Schlüssel)
1. Auf **console.anthropic.com** registrieren, Guthaben aufladen (z. B. 5 €) und unter **API Keys** einen Schlüssel erstellen.
2. Bei GitHub als Secret **ANTHROPIC_API_KEY** eintragen (wie in Schritt 6).
Kosten: wenige Cent pro Anfrage, getrennt von deinem Claude-Abo. Der Bot meldet sich in Telegram, sobald die Einschätzung da ist.

## Kaufrückblick
Im Depot unter **Kaufrückblick** und per Telegram (täglich um 21 Uhr kurz, sonntags ausführlich, jederzeit mit `/rueckblick`):
- **Seit Kauf** in Prozent und in Euro, ab 60 Tagen auch aufs Jahr gerechnet
- **Gegen MSCI World:** wie viele Prozentpunkte und wie viel Euro du gegenüber dem MSCI World im selben Zeitraum vorn oder hinten liegst
- **Spanne seit Kauf:** bester und schlechtester Stand und wie weit du gerade unter dem Höchststand bist
- **Kaufzeitpunkt genau:** an wie vielen der Handelstage rund um deinen Kauf (5 davor, 5 danach) es günstiger gewesen wäre
- **Nach 1 Tag, 1 Woche, 1 Monat:** wie sich der Kauf direkt danach entwickelt hat, und ob der **Kaufzeitpunkt** eher günstig oder teuer war
- **Zufalls-Check:** Wie viel Prozent der Vergleichswerte hat dein Kauf im selben Zeitraum geschlagen? Um 50 % ist wie Zufall, darüber besser.
- **Chance, über deinem Kaufpreis zu liegen:** morgen, in 1 Woche, in 3 Monaten (Schätzung aus Trend und Schwankung)
- **Stabilität** jeder Entscheidung: stabil, wackelig oder kritisch, mit Gründen
- **Erwarteter Bereich** in 1 Woche und 3 Monaten
- **Verkäufe im Rückblick:** Hat sich der Verkauf gelohnt (in Euro: vermiedener Verlust oder entgangener Gewinn)?
- Dafür braucht jeder Kauf ein **Kaufdatum** (beim Eintragen bzw. unter Ändern › Bearbeiten). Test-Einträge zählen nicht.

## Sicherheits-Analyse (/analyse)
Schreib dem Bot `/analyse`. Du bekommst zuerst eine Übersicht aller deiner Werte mit Ampel und Punkten (0 bis 100, nach Anteil gewichtet auch fürs ganze Depot). Danach kommt zu jedem Wert eine eigene Nachricht, der unsicherste zuerst:
- **Warum genau:** jeder Grund mit seinen Punkten, z. B. Schwankung pro Jahr, größter Rückgang im letzten Jahr, Trend gegenüber 20-, 50- und 200-Tage-Schnitt, Frühwarnungen, Nachrichtenlage, Einzelaktie oder ETF, Anteil am Depot, Dollar-Risiko, anstehende Quartalszahlen
- **Zukunft:** erwarteter Kurs und Bereich in 1 Woche und 3 Monaten, Chance auf Plus, Chance über deinem Kaufpreis zu liegen, dazu die KI-Einschätzung mit Dafür und Dagegen und den Quellen
- **Alternativen:** bis zu 3 passende breitere oder ruhigere Werte, jeweils mit Begründung und ihren eigenen Zahlen (Sicherheit, Schwankung, Trend, Chance). Werte, die gerade selbst eine Frühwarnung haben, stehen hinten und sind markiert.

Mit `/analyse Siemens` prüfst du einen einzelnen Wert, auch einen, den du noch nicht besitzt. Alles ist aus Kursdaten geschätzt und keine Anlageberatung.

## Gewinnschutz
Zusätzlich zur Meldegrenze im Minus: Der Bot meldet sich, wenn der Kurs um **x %** unter seinen **Höchststand seit Kauf** fällt, solange du noch im Plus bist. So merkst du, wenn ein Gewinn schrumpft. Einstellbar beim Eintragen, unter Ändern › Bearbeiten, mit − / + direkt auf der Aktienseite und als Standard unter ⚙️ (0 = aus).

**Oder in Euro:** Auf der Aktienseite (und unter Ändern › Bearbeiten) kannst du stattdessen einen Betrag eintragen, z. B. 20 €. Dann meldet sich der Bot, sobald dein Gewinn um 20 € kleiner ist als sein bisher höchster Stand seit Kauf.

## Hilfe bei Problemen

**A. Der Ordner `.github` fehlt bei GitHub.**
Im Projekt **Add file** → **Create new file**. Als Namen genau `.github/workflows/wachmann.yml` eintippen (die Schrägstriche erzeugen die Ordner). Dann den Inhalt der Datei `bot/wachmann.yml` aus dem Zip (mit einem Texteditor öffnen, gleicher Inhalt) hineinkopieren → **Commit changes**.

**B. Bei Actions steht ein rotes ❌.**
Auf den roten Eintrag klicken → **lauf** → rot markierten Schritt aufklappen. Häufigste Ursache: ein Secret falsch geschrieben (Großbuchstaben, kein Leerzeichen). Schick mir den Fehlertext (ohne deine Codes!).

**C. Der Bot antwortet nicht.**
`TELEGRAM_CHAT` richtig eingetragen? Bei Actions grüne Haken? Manuell **Run workflow** drücken und 1 Minute warten.

**D. In der App steht „Sync-Passwort passt nicht“.**
Das Passwort in der App und das Secret `SYNC_PASSWORD` müssen exakt gleich sein (Groß/Klein beachten).

**E. In der App steht „GitHub-Schlüssel ungültig“.**
Schlüssel abgelaufen oder ohne „Contents: Read and write“. Schritt 10 wiederholen und neuen Schlüssel in der App eintragen.

**F. Keine Live-Kurse.**
Finnhub-Schlüssel in der App prüfen. Live gibt es nur für US-Aktien. Deutsche Aktien bekommen 1x täglich den Schlusskurs.

**G. Nach 60 Tagen läuft der Wachmann nicht mehr.**
GitHub stoppt geplante Abläufe in Projekten ohne Änderungen. Die täglichen KI-Updates verhindern das. Falls doch: Actions → Wachmann → **Enable workflow**.

---

## Gut zu wissen

- **Öffentlich sichtbar** sind nur: der App-Code, die KI-Texte (`ki.json`) und welche Aktien beobachtet werden. **Nicht sichtbar:** wie viele Aktien du hast, Kaufpreise, Finanzen, Kaufhilfe, deine Codes. Diese sind verschlüsselt oder nur auf deinem Handy.
- **Später etwas ändern:** Einfach im Claude-Projekt sagen, was anders sein soll. Ich ändere die Dateien und lade sie bei verbundenem Projekt direkt hoch.
- **Keine Anlageberatung.** Prognosen sind Schätzungen. Die Entscheidung triffst immer du.

## KI-Einschätzung auf Anfrage in 5 bis 10 Minuten (über dein Claude-Abo)

1. Auf claude.ai/code/routines die Aufgabe „Aktien Helfer KI-Anfrage“ öffnen, „Add another trigger“ → „API“ → „Generate token“.
2. Im GitHub-Repository unter Settings → Secrets and variables → Actions zwei Secrets anlegen:
   - `KI_ROUTINE_URL`: die angezeigte Adresse (endet auf `/fire`)
   - `KI_ROUTINE_TOKEN`: der Token (beginnt mit `sk-ant-oat01-`, wird nur einmal angezeigt)
Danach startet der Wachmann bei „KI-Einschätzung anfordern“ die Aufgabe sofort und meldet sich per Telegram, sobald die Einschätzung da ist.
