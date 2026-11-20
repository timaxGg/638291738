# Mein Anlageplan – App + Telegram-Bot

Die App setzt das Regelwerk um (siehe `regelwerk.pdf`): Momentum-Top-10, flexibles Gold, Crash-Schutz über die 200-Tage-Linie, Ausweich EU-Aktien → Gold → Geldmarkt, Schwankungs-Bremse.

## Was läuft wo

| Teil | Aufgabe |
|---|---|
| **App** (GitHub Pages) | Status, Aufträge mit Stückzahlen, Depot (Soll/Ist), Auswahl/Rangliste, Verlauf, Regeln |
| **Wachmann** (`.github/workflows/wachmann.yml` → `bot/plan.mjs`) | alle 5 Min.: Telegram-Befehle · zu Börsenzeiten alle 30 Min.: Kurse + Hinweise · nach US-Schluss (ab 22:20 Uhr): Regeln prüfen, Aufträge berechnen, Nachricht schicken |
| **Daten** | `data/plan.json` (öffentlich, für die App) · `data/plan-state.json` (Zustand des Plans) · `data/depot.enc` (dein Depot, verschlüsselt) |

Kurse kommen von Yahoo Finance (kein Schlüssel nötig).

## Einrichtung (einmalig)

Die Secrets vom alten Aktien Helfer werden weiter genutzt: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT`, `SYNC_PASSWORD`.

1. App öffnen → ⚙️ Einstellungen: GitHub-Repository, GitHub-Schlüssel und Sync-Passwort eintragen (werden vom alten Aktien Helfer übernommen, falls vorhanden).
2. Depot → Bargeld eintragen (und vorhandene Positionen).
3. Fertig. Ab dem nächsten Abend bekommst du Aufträge mit genauen Stückzahlen.

## Telegram-Befehle

`/status` · `/auftrag` · `/erledigt` · `/depot` · `/liste` · `/bargeld 5000` · `/kauf AAPL 3 210` · `/verkauf AAPL 3 220` · `/hilfe`

## Hinweise vom Bot

- ⚠️ **Vorwarnung** / 🟡 **Info**: folgt direkt aus dem Plan (z. B. S&P 500 nur noch 2 % über der Linie).
- 🧪 **Zusatz-Hinweis**: optionale Tipps (Gewicht zurückführen, schwache Aktie ersetzen) – **nicht** im 20-Jahres-Test geprüft.

## Auswahlliste erneuern

Alle 5 Jahre (nächstes Mal November 2031) `bot/universum.mjs` auf die dann ~100 größten US- und EU-Firmen aktualisieren.

Die alte Version des Aktien Helfers ist im Branch `alter-aktien-helfer` gesichert.
