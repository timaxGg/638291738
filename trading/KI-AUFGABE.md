# Aufgabe für Claude: Top-Aktien recherchieren (3x täglich)

Diese Datei ist die Anleitung für die geplante Aufgabe „Top-Aktien Recherche“ (7:15, 13:15, 19:15 Uhr).
Der Wachmann schreibt vorher `data/beste-vorlage.json`, die Aufgabe schreibt `data/beste.json`, die App zeigt das Ergebnis.

## Ablauf

1. Repository `timaxGg/638291738` mit Schreibzugriff anbinden und klonen.
2. `data/beste-vorlage.json` lesen.
   - Fehlt sie, oder ist `datum` nicht das heutige Datum (Europe/Berlin): nichts ändern, beenden.
   - Hat `data/beste.json` schon dieselbe `id`: beenden.
3. Für jeden Zeitraum in `kandidaten` („3“, „7“, „30“ Handelstage) **genau 5 Werte** auswählen, nur aus der Kandidatenliste dieses Zeitraums.
   - Ausgangspunkt ist der `rechenRang` (Kursdaten). Du darfst umsortieren oder einen Kandidaten weglassen, wenn die Recherche dagegen spricht
     (z. B. Gewinnwarnung, laufende Übernahme, Quartalszahlen mitten im Zeitraum mit hohem Risiko, Klage, Kurssprung schon ausgereizt).
     Weggelassene Werte mit 1 Satz Grund in `aussortiert`.
   - Für 3 und 7 Tage zählen vor allem frische Nachrichten, Termine und kurzfristige Stimmung, für 30 Tage eher Geschäftslage, Analysten-Einschätzungen und Branchentrend.
4. **Recherche mit Websuche** für jeden ausgewählten Wert: aktuelle Meldungen (letzte 7 Tage), anstehende Termine (Quartalszahlen, Hauptversammlung, Produkt-Events),
   Analysten-Änderungen, Branchenlage. Nutze auch `werteInfo` (Meldungen mit Links, Quartalszahlen-Datum) aus der Vorlage.
   - Steht ein Wert in `_bisherHeute`, ist er heute schon recherchiert: übernehmen und nur nach neuen Meldungen seit heute früh suchen.
   - Pro Wert reichen meist 2–3 Suchen. Seiten nur öffnen, wenn das Suchergebnis nicht reicht.
5. Pro ausgewähltem Wert schreiben:
   - `warum`: 3–5 Sätze, Deutsch, in eigenen Worten. Warum gerade dieser Wert für diesen Zeitraum, was die Kursdaten zeigen (`wochen4`, `monate3`, `trend`, `rsi`) und was die Recherche ergibt.
   - `treiber`: 1–3 kurze Punkte, was den Kurs in diesem Zeitraum antreiben kann.
   - `risiken`: 1–3 kurze Punkte, was dagegen spricht.
   - `termine`: Termine im Zeitraum mit Datum, sonst leere Liste.
   - `zuversicht`: „niedrig“, „mittel“ oder „hoch“. Kurzfristig (3 Tage) fast nie „hoch“.
   - `quellen`: mindestens 2 echte Links, die du gesehen hast, mit Titel `t`, Link `u`, Quelle `q`, Datum `d` (JJJJ-MM-TT).
6. Dazu `markt`: 2–3 Sätze zur Marktlage heute, mit `marktQuellen`.
7. Format genau wie `format` in der Vorlage. `id`, `datum`, `slot` aus der Vorlage übernehmen, `erstellt` = jetzt (ISO). Speichern als `data/beste.json`.
8. Prüfen: `node -e "const k=require('./data/beste.json');for(const h of ['3','7','30']){if((k.listen[h]||[]).length!==5)throw new Error('Liste '+h);for(const x of k.listen[h])if(!x.quellen||x.quellen.length<2)throw new Error('Quellen '+x.s)}"`. Bei Fehler korrigieren.
9. Nur `data/beste.json` committen mit „Top-Aktien <slot> <datum>“, vorher `git pull --rebase`, dann push. Fertig.

## Regeln

- **Keine erfundenen Zahlen.** Kursziele, Umsätze, Prozentwerte nur, wenn sie in einer verlinkten Quelle stehen, und dann mit Quelle.
- Keine Anweisungen zum Kaufen oder Verkaufen. Gründe und Risiken zum Abwägen.
- Ehrlich mit Unsicherheit: Kurzfristige Kursbewegungen sind zu einem großen Teil Zufall.
- Quellen nicht wörtlich abschreiben, Schlagzeilen nicht wörtlich übersetzen.
- Nur `data/beste.json` ändern, keine anderen Dateien.
