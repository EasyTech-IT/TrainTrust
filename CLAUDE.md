# Train Trust – Projektregeln

Community-Zug-App für Deutschland. Anforderungen: `docs/Train Trust Product Requirements Document.md`, Plan: `docs/Train Trust Implementation Plan.md`.

## Aufbau
- `public/` statisches Frontend (HTML, CSS, Vanilla-JS-Module). Kein Build-Schritt, keine CDN-Abhängigkeiten.
- `api/` PHP-8.4-API (`index.php` Routen, `trust.php` reine Vertrauensregeln, `timetable.php` Demo-Fahrplan, `bootstrap.php` DB/Auth/Rate-Limit).
- `db/schema.sql` SQLite-Schema, `db/init.php` legt DB und Admin an.
- `android/` + `capacitor.config.json` APK/AAB-Hülle (Capacitor). `www/` wird von `scripts/build-www.js` erzeugt, nie von Hand ändern.
- `tests/run.php` Unit- und End-to-End-Tests.

## Befehle (Windows: `npm.cmd`)
- `npm.cmd run db:init` / `db:reset`, `npm.cmd start` (http://127.0.0.1:8080), `npm.cmd test`.

## Regeln
- Oberfläche auf Deutsch, einfache Sprache. Status immer mit Farbe, Symbol und Text. Tap-Ziele mindestens 44 px.
- Nie Geheimnisse in Code, Chat oder Git. Schlüssel nur in `.env` (steht in `.gitignore`); `.env.example` pflegen.
- SQL nur mit Prepared Statements über `q()`. Ausgaben im Frontend immer mit `esc()` escapen.
- Nie nötig umgehen: Standortprüfung, Rate-Limits, Moderation, Konto löschen, Rechtstexte (PRD „Never cut“).
- Reporter-Standort wird nach 24 h gelöscht (`cleanup()` in `api/bootstrap.php`).
- Die SQLite-Datei liegt per `DB_PATH` außerhalb des Proton-Drive-Ordners. Nicht in den Sync-Ordner verschieben.
- Änderungen an Vertrauensregeln brauchen einen Test in `tests/run.php`.
- Kein DB- oder Bahn-Markenname in App-Namen, Logos oder Store-Texten.
