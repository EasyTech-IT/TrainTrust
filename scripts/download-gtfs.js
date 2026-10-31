// Downloads the complete Germany feed to a directory outside synced folders.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const base = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'TrainTrust', 'gtfs')
  : path.join(os.homedir(), '.traintrust', 'gtfs');
const url = 'https://download.gtfs.de/germany/free/latest.zip';
const zip = path.join(base, 'full.zip');
const partialZip = path.join(base, 'full.part.zip');
const out = path.join(base, 'full');
const staging = path.join(base, `full.extract-${process.pid}`);
const quote = (value) => `'${value.replace(/'/g, "''")}'`;

async function main() {
  fs.mkdirSync(base, { recursive: true });
  if (!fs.existsSync(partialZip)) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`GTFS-Download fehlgeschlagen: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(partialZip));
  }
  const stat = fs.statSync(partialZip);
  const fd = fs.openSync(partialZip, 'r');
  const signature = Buffer.alloc(2);
  fs.readSync(fd, signature, 0, signature.length, 0);
  fs.closeSync(fd);
  if (stat.size < 1024 || signature.toString() !== 'PK') {
    throw new Error('Der GTFS-Download ist unvollständig oder kein ZIP-Archiv.');
  }

  fs.rmSync(staging, { recursive: true, force: true });
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath ${quote(partialZip)} -DestinationPath ${quote(staging)} -Force`,
  ], { stdio: 'inherit' });
  if (!fs.existsSync(path.join(staging, 'stops.txt')) || !fs.existsSync(path.join(staging, 'stop_times.txt'))) {
    throw new Error('Im Archiv fehlen erforderliche GTFS-Dateien.');
  }

  const backup = `${out}.previous-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (fs.existsSync(out)) fs.renameSync(out, backup);
  fs.renameSync(staging, out);
  fs.renameSync(partialZip, zip);
  console.log(`Deutschland-Feed heruntergeladen und entpackt: ${out}`);
  console.log(`Archivgröße: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  if (fs.existsSync(backup)) console.log(`Vorheriger Feed bleibt erhalten: ${backup}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
