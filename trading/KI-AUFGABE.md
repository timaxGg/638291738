# Aufgabe für Claude: Top-Aktien recherchieren (3x täglich)

Diese Datei ist die Anleitung für die geplante Aufgabe „Top-Aktien Recherche“ (7:15, 13:15, 19:15 Uhr).
Der Wachmann schreibt vorher `data/beste-vorlage.json`, die Aufgabe schreibt `data/beste.json`, die App zeigt das Ergebnis.

## Ablauf

1. Repository `timaxGg/638291738` mit Schreibzugriff anbinden und klonen.
2. `data/beste-vorlage.json` lesen.
   - Fehlt sie, oder ist `datum` nicht das heutige Datum (Europe/Berlin): nichts ändern, beenden.
   - Hat `data/beste.json` schon dieselbe `id`: beenden.
3. Für jeden Zeitraum in `kandidaten` („3“, „7“, „30“ Handelstage) **genau 5 Werte** auswählen, nur aus der Kandidatenliste dieses Zeitraums.
   Die Kandidaten sind die 10 besten aus über 200 Aktien und ETFs (`typ` a = Aktie, e = ETF). Bei ETFs zählen Branche, Region, Zinsen und Rohstoffe statt Firmenmeldungen.
   - Ausgangspunkt ist der `rechenRang` (Kursdaten). Du darfst umsortieren oder einen Kandidaten weglassen, wenn die Recherche dagegen spricht
     (z. B. Gewinnwarnung, laufende Übernahme, Quartalszahlen mitten im Zeitraum mit hohem Risiko, Klage, Kurssprung schon ausgereizt).
     Weggelassene Werte mit 1 Satz Grund in `aussortiert`.
   - **3 und 7 Tage sind reine Kurzfrist-Trades** (kaufen, kurz halten, verkaufen). Kosten und Steuern müssen erst verdient werden: Siehe `kostenUndZiel` in der Vorlage. Wähle nur Werte, bei denen ein Anstieg über `noetigerAnstiegBrutto` im Zeitraum plausibel ist (Vergleich mit `typBew`, der üblichen Bewegung). Träge Werte und langsame ETFs eher aussortieren und das in `aussortiert` sagen. Nenne im `ausblick`, ob die nötige Steigerung realistisch ist.
   - Für 3 und 7 Tage zählen vor allem frische Nachrichten, Termine und kurzfristige Stimmung, für 30 Tage eher Geschäftslage, Analysten-Einschätzungen und Branchentrend.
4. **Recherche mit Websuche** für jeden ausgewählten Wert: aktuelle Meldungen (letzte 7 Tage), anstehende Termine (Quartalszahlen, Hauptversammlung, Produkt-Events),
   Analysten-Änderungen, Branchenlage. Nutze auch `werteInfo` (Meldungen mit Links, Quartalszahlen-Datum) aus der Vorlage.
   - Steht ein Wert in `_bisherHeute`, ist er heute schon recherchiert: übernehmen und nur nach neuen Meldungen seit heute früh suchen.
   - Pro Wert reichen meist 2–3 Suchen; Werte, die in mehreren Zeiträumen vorkommen, nur einmal recherchieren. Seiten nur öffnen, wenn das Suchergebnis nicht reicht.
5. Pro ausgewähltem Wert schreiben:
   - `einschaetzung`: 1 kurzer Satz Fazit (z. B. „Chancen überwiegen leicht“, „Trend intakt, aber teuer“).
   - `ausblick`: 2–4 Sätze Zukunftsanalyse: wie es im Zeitraum am wahrscheinlichsten weitergeht und warum, mit Bezug auf Kursdaten, Termine und Recherche.
   - `szenarien`: `gut` (1 Satz: was passieren muss, damit es gut läuft) und `schlecht` (1 Satz: was es kippen würde).
   - `warum`: 3–5 Sätze, Deutsch, in eigenen Worten. Warum gerade dieser Wert für diesen Zeitraum, was die Kursdaten zeigen (`wochen4`, `monate3`, `trend`, `rsi`) und was die Recherche ergibt.
   - `treiber`: 1–3 kurze Punkte, was den Kurs in diesem Zeitraum antreiben kann.
   - `risiken`: 1–3 kurze Punkte, was dagegen spricht.
   - `termine`: Termine im Zeitraum mit Datum, sonst leere Liste.
   - `zuversicht`: „niedrig“, „mittel“ oder „hoch“. Kurzfristig (3 Tage) fast nie „hoch“.
   - `quellen`: mindestens 2 echte Links, die du gesehen hast, mit Titel `t`, Link `u`, Quelle `q`, Datum `d` (JJJJ-MM-TT).
6. Dazu `markt`: 2–3 Sätze zur Marktlage heute, mit `marktQuellen`.
   - `muster` in den Fakten sind erkannte Kursmuster mit ihrem Rückblick-Ergebnis. Nur mit Vorsicht erwähnen, nie als Hauptgrund, und dazusagen, wie unsicher sie sind.
   - Steht `_lernen` in der Vorlage (einmal pro Woche abends): Du darfst EIN Update der Rechnung vorschlagen (Feld `vorschlag`), siehe `_lernen.aufgabe`.
     `aenderung` darf 1–2 Einstellungen aus `_lernen.einstellungen` eines Zeitraums ändern, innerhalb von min/max. Begründe ehrlich in einfachen Worten, auch was dagegen spricht.
     Kein überzeugender Kandidat im `variantenTest`: keinen Vorschlag machen. Wirksam wird ein Update nur, wenn der Nutzer zustimmt.
7. Format genau wie `format` in der Vorlage. `id`, `datum`, `slot` aus der Vorlage übernehmen, `erstellt` = jetzt (ISO). Speichern als `data/beste.json`.
8. Prüfen: `node -e "const k=require('./data/beste.json');for(const h of ['3','7','30']){if((k.listen[h]||[]).length!==5)throw new Error('Liste '+h);for(const x of k.listen[h]){if(!x.quellen||x.quellen.length<2)throw new Error('Quellen '+x.s);if(!x.ausblick||!x.einschaetzung)throw new Error('Ausblick '+x.s)}}"`. Bei Fehler korrigieren.
9. Nur `data/beste.json` committen mit „Top-Aktien <slot> <datum>“, vorher `git pull --rebase`, dann push. Fertig.

## Regeln

- **Keine erfundenen Zahlen.** Kursziele, Umsätze, Prozentwerte nur, wenn sie in einer verlinkten Quelle stehen, und dann mit Quelle.
- Keine Anweisungen zum Kaufen oder Verkaufen. Gründe und Risiken zum Abwägen.
- Ehrlich mit Unsicherheit: Kurzfristige Kursbewegungen sind zu einem großen Teil Zufall.
- Quellen nicht wörtlich abschreiben, Schlagzeilen nicht wörtlich übersetzen.
- Nur `data/beste.json` ändern, keine anderen Dateien.
