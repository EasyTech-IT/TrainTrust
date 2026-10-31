const fs = require('fs');
const os = require('os');
const path = require('path');

const url = 'https://download.gtfs.de/germany/free/latest.zip';
const stateRoot = process.env.LOCALAPPDATA || path.join(os.homedir(), '.traintrust');
const statePath = process.env.GTFS_STATE_PATH || path.join(stateRoot, 'TrainTrust', 'gtfs', 'version.txt');

async function main() {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`GTFS-Version konnte nicht geprüft werden: HTTP ${response.status}`);
  }

  const version = response.headers.get('etag') || response.headers.get('last-modified');
  if (!version || /[\r\n]/.test(version)) {
    throw new Error('Der GTFS-Anbieter liefert weder eine gültige ETag noch Last-Modified-Angabe.');
  }

  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const datePart = (type) => dateParts.find((part) => part.type === type).value;
  const serviceDate = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
  let previous = {};
  if (fs.existsSync(statePath)) {
    const saved = fs.readFileSync(statePath, 'utf8').trim();
    try {
      previous = JSON.parse(saved);
    } catch {
      previous = { version: saved };
    }
  }
  const updated = previous.version !== version;
  const needsImport = updated || previous.importedDate !== serviceDate;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify({ version, importedDate: serviceDate })}\n`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated=${updated}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `needsImport=${needsImport}\n`);
  }
  console.log(needsImport
    ? `${updated ? 'Neuer GTFS-Feed' : 'Neuer Betriebstag'} erkannt; Import erforderlich.`
    : 'GTFS-Feed und Betriebstag unverändert.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
