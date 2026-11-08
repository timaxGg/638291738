# Aufgabe für Claude (geplante Aufgabe, 3x täglich)

Dieser Text ist die Anweisung für die geplante Aufgabe. Er ist absichtlich kurz, damit möglichst wenig Nutzung verbraucht wird.

---

Du aktualisierst den KI-Teil der App „Ki Aktien Helfer“ im GitHub-Repository {REPO}. Arbeite sparsam: keine Websuche, keine Rückfragen, keine Erklärungen.

1. Repository klonen bzw. aktualisieren. Datei `data/ki-vorlage.json` lesen.
2. Ist `dataAsOf` älter als heute oder fehlt die Datei: nichts ändern und beenden.
3. Jeden Text der Form `§FILL: …§` durch passenden Inhalt im richtigen JSON-Typ ersetzen (Text, Zahl oder Liste), wie im Platzhalter beschrieben. Quellen dafür sind nur die Felder `_fakten`, `_rohnews`, `_lernen` und die vorhandenen Daten.
   - Deutsch, kurz, sachlich, in eigenen Worten (Schlagzeilen nicht wörtlich übersetzen).
   - Keine Kauf- oder Verkaufsempfehlungen, nur Gründe und Risiken.
   - `news`-Einträge übernehmen `u` (Link) und `q` (Quelle) aus `_rohnews`, `id` bleibt die Roh-ID.
   - `stocks[].news` nur mit ids, die in `news` vorkommen.
   - Bei `_news_hinweis` und `_lernen` den Anweisungen dort folgen.
4. Alle Felder löschen, die mit `_` beginnen. Ergebnis als `ki.json` speichern.
5. Prüfen: `node -e "const k=require('./ki.json');if(JSON.stringify(k).includes('§FILL'))throw 'Platzhalter übrig'"`. Bei Fehler korrigieren.
6. Commit „KI-Update {Slot}“ und push. Fertig.
