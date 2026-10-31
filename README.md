# Train Trust

Community-Zug-App: Fahrplan und Abfahrten plus Live-Meldungen von Fahrgästen. Grundlage: [PRD](docs/Train%20Trust%20Product%20Requirements%20Document.md) und [Implementierungsplan](docs/Train%20Trust%20Implementation%20Plan.md).

**Technik:** statisches HTML/CSS/JS (`public/`) + PHP-API (`api/`) + SQLite (`db/`). Als Android-App (APK/AAB) über Capacitor verpackt.

## Schnellstart (Windows)

```powershell
npm.cmd install          # einmalig
copy .env.example .env   # einmalig, dann .env anpassen
npm.cmd run db:init      # Datenbank + Admin anlegen
npm.cmd start            # http://127.0.0.1:8080
npm.cmd test             # alle Tests
```

- App: http://127.0.0.1:8080 · Admin: http://127.0.0.1:8080/admin.html
- Admin-Zugang steht in `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) und gilt beim ersten `db:init`.
- `DEV_SKIP_LOCATION=1` überspringt lokal die Standortprüfung (am Schreibtisch bist du nicht im Zug). In Produktion `0`.
- Zum Testen der Bestätigung (3 Fahrgäste nötig) drei Konten anlegen, z. B. in drei Browserprofilen.
- Die Erstinstallation enthält Demo-Fahrten aus Rhein-Main. Mit `npm.cmd run data:download` und `npm.cmd run data:import` werden die bundesweiten GTFS-Haltestellen und Fahrten für den aktuellen Tag geladen.

## Funktionen (Überblick)
- Start: Von/Nach-Suche mit Tausch-Knopf, optionalem Zwischenstopp, Uhrzeit, „Ticket kaufen“ (Link zur Buchungsseite der Bahn, keine eigenen Tickets), Meistgesucht, Favoriten, Umgebung, Community live (Gäste lesen nur), Einschränkungen, Fahrrad-Tipps, Profil, FAQ.
- Orts- und Haltestellensuche: Vorschläge erscheinen beim Tippen oder Antippen des Felds; Suche ignoriert Groß-/Kleinschreibung und Umlaute. Zwischenstopps filtern die Verbindungssuche.
- Zugdetail: ganze Strecke, gewählter Abschnitt grün markiert, Wagenzahl aus der Community (Konto + Standortprüfung nötig).
- Karte (Leaflet, `public/vendor/leaflet`): füllt den freien Bildschirmbereich, zeigt Haltestellen im Kartenausschnitt und eine scrollbare Liste in der Nähe. Tippen setzt „Ich bin hier“, Standort-Knopf, Live folgen. Kacheln von OpenStreetMap – für den Produktivbetrieb die Nutzungsrichtlinie beachten oder einen eigenen Kachel-Anbieter nutzen.
- Glas-Design in `public/css/glass.css`, Icons in `public/js/icons.js`.

## Ordner

| Ordner | Inhalt |
| --- | --- |
| `public/` | App (`index.html`), Admin (`admin.html`), Service Worker, Manifest, Icons, Schrift |
| `api/` | PHP-API: Routen, Vertrauensregeln, Demo-Fahrplan |
| `db/` | `schema.sql`, `init.php` |
| `android/` | Android-Projekt (Capacitor) |
| `tests/` | `run.php` |
| `scripts/` | Icons erzeugen, `www/` für die APK bauen |

## Android: APK und Play Store

1. `capacitor.config.json` hat die App-ID `de.traintrust.app`. Ändere sie **vor** dem ersten Upload, danach geht es nicht mehr.
2. In `public/js/config.js` bei `NATIVE_API_BASE` die echte HTTPS-Adresse deines Servers eintragen. In der `.env` des Servers `ALLOWED_ORIGINS` mit `https://localhost,capacitor://localhost` belassen.
3. Test-APK: `npm.cmd run apk:debug` → `android/app/build/outputs/apk/debug/app-debug.apk`.
4. Play Store braucht ein **AAB**, kein APK: `npm.cmd run aab:release` → `android/app/build/outputs/bundle/release/app-release.aab`. Der Upload-Schlüssel liegt in `%LOCALAPPDATA%\TrainTrust\keys\` (Passwort in `keystore.properties`, nicht im Git). **Sichere beides extern** (z. B. Passwortmanager). Details: <https://developer.android.com/studio/publish/app-signing>.
5. Voraussetzungen (hier schon eingerichtet): JDK 21, Android SDK in `%LOCALAPPDATA%\Android\Sdk`, `JAVA_HOME` und `ANDROID_HOME` als Nutzer-Variablen. Öffne ein neues Terminal, damit sie gelten.
6. Nach jeder Änderung an `public/`: `npm.cmd run cap:sync`.
7. Icons neu erzeugen: `npm.cmd run icons`.

## Server (Produktion)

PHP 8.2+ mit `pdo_sqlite`, HTTPS-Reverse-Proxy (Caddy/Nginx). `public/` als Webroot, `/api/*` auf `api/index.php` leiten (analog zu `router.php`). `DB_PATH` auf ein beschreibbares, gesichertes Verzeichnis setzen und Backups einrichten. `.env` nie öffentlich ausliefern (liegt außerhalb von `public/`).

## GitHub Pages

Der Workflow `Deploy app to GitHub Pages` veröffentlicht den Inhalt von `public/` unter `https://easytech-it.github.io/TrainTrust/`. In den Repository-Einstellungen unter **Settings → Pages** muss als Quelle **GitHub Actions** ausgewählt sein.

GitHub Pages kann nur statische Dateien ausliefern. Die PHP-API und SQLite-Datenbank laufen dort nicht; Verbindungssuche, Fahrplan, Konto und Community benötigen zusätzlich einen PHP-Server mit HTTPS. Erst wenn eine API-Adresse eingerichtet und für die Webseite freigegeben ist, funktionieren diese Funktionen online. Zugangsdaten und `.env` gehören nicht in GitHub Pages.

## Zahlungen

Premium ist als **Demo** vorhanden (`PAYMENTS_MODE=demo`). Für digitale Abos in der Android-App schreibt Google die **Google Play Billing** vor (Stripe/PayPal sind dort nicht erlaubt). Nächster Schritt: Play-Billing-Plugin (z. B. RevenueCat) einbinden und die Käufe serverseitig in `/premium/…` prüfen. Erst nach den Tests der Preise mit der Warteliste.

## Echte Daten und Zugänge

**Fahrplan: deutschlandweiter GTFS-Feed von gtfs.de** (CC BY 4.0, DELFI e.V.). Der Download und die entpackten Dateien liegen außerhalb des synchronisierten Ordners unter `%LOCALAPPDATA%\TrainTrust\gtfs\full`.
- Einmalig herunterladen: `npm.cmd run data:download`. Danach importiert `npm.cmd run data:import` alle Haltestellen und die Fahrten des heutigen Tages in die konfigurierte SQLite-Datenbank. Für ein anderes Datum: `php db/import_gtfs.php --date=YYYY-MM-DD`.
- Der Import ist speicherschonend und erhält vorhandene Nutzerkonten und gemeldete Fahrten. Fahrplanfahrten ohne Community-Meldungen werden nach zwei Tagen entfernt. Bei einem Datum ohne aktive Feed-Fahrten bricht er ab, ohne die Datenbank zu ändern.
- Die Aktualisierung wird in `.github/workflows/gtfs-update.yml` alle 15 Minuten anhand von ETag/Last-Modified geprüft (gtfs.de bietet keinen Push-Hook). Importiert wird bei einer neuen Feed-Version und außerdem einmal je neuem Betriebstag in deutscher Zeit. Für den automatischen Server-Import müssen unter **Settings → Secrets and variables → Actions** die Secrets `GTFS_DEPLOY_HOST`, `GTFS_DEPLOY_USER`, `GTFS_DEPLOY_PATH` (absoluter Unix-Pfad zum Projekt), `GTFS_DEPLOY_SSH_KEY` und `GTFS_DEPLOY_KNOWN_HOSTS` gesetzt sein; `GTFS_DEPLOY_PORT` ist optional (Standard 22). `GTFS_DEPLOY_KNOWN_HOSTS` muss den vorab geprüften Hostschlüssel enthalten. Wenn die erforderlichen Secrets fehlen, meldet der Workflow den Import als übersprungen, versucht es beim nächsten Lauf erneut und speichert die noch ausstehende Feed-Version nicht als importiert. Auf dem Server müssen PHP mit `pdo_sqlite`, `unzip`, die aktuelle App-Version und eine korrekt gesetzte `.env` mit `DB_PATH` vorhanden sein.
- Der Feed enthält geplante Fahrten, keine Echtzeit. Die App nennt gtfs.de als Datenquelle. Die DB-Timetables-Zugangsdaten kannst du selbst in `.env` (`DB_TIMETABLES_CLIENT_ID`, `DB_TIMETABLES_API_KEY`) eintragen; sie werden nicht vom GTFS-Workflow benötigt.

**Echtzeit (läuft): DB API Marketplace → „Timetables“.** Mit den Keys in `.env` (`DB_TIMETABLES_CLIENT_ID`, `DB_TIMETABLES_API_KEY`) gleicht `api/realtime.php` die Abfahrtstafel eines Bahnhofs (höchstens einmal pro Minute) mit Verspätungen, Ausfällen und Gleisänderungen ab. Ohne Keys zeigt die App die geplanten Zeiten.
Später möglich: `RIS::Boards` und `RIS::Journeys` (Echtzeit, Vertrag mit DB nötig), `RIS::Transports` (Wagenreihung), `RIS::Disruptions` (Störungsgründe), `StaDa`/`FaSta` (Bahnhofsdaten, Aufzüge). Die Bonvoyo-, Shared-Mobility-, Parking- und Digitaler-Befehl-APIs brauchst du nicht.

Weitere Zugänge:
- **Hinweise (läuft, in der App):** Reiter „Hinweise“ zeigt Verspätung (ab 5 Min.), Ausfall und Gleisänderung für Favoriten (Stern). Die App fragt jede Minute nach. Damit auch ohne offene App neue Hinweise entstehen, alle 2 Minuten ausführen: `schtasks /Create /SC MINUTE /MO 2 /TN TrainTrustPoll /TR "cmd /c cd /d <Projektordner> && npm.cmd run data:poll"` (Server: Cron `*/2 * * * * php db/poll_realtime.php`). Täglicher Import analog (`data:download` + `data:import`).
- Echte Push-Nachrichten (FCM): Firebase-Projekt, `google-services.json` in `android/app/` und Dienstkonto auf dem Server. Danach schickt der Server dieselben Hinweise zusätzlich per Push.
- Google/Apple-Anmeldung (FR-1): Firebase- bzw. Apple-Developer-Konto nötig. Aktuell E-Mail + Passwort.
- Push (FCM): Firebase-Projekt, `google-services.json` in `android/app/`.
- Impressum, Datenschutz, Nutzungsbedingungen in `public/js/app.js` (Objekt `LEGAL`) ausfüllen und juristisch prüfen.
- Google-Play-Konsole-Konto (25 USD einmalig).

## Noch nicht enthalten (laut Plan später)

Live-Karte, echte Push-Nachrichten (FCM), echte Bezahlung, Google/Apple-Login, englische Oberfläche, Bestätigungs-Abfrage „Ist dein Zug auch verspätet?“.
