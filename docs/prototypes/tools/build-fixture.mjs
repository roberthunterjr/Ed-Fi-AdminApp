/* Turns a vendor's Data Mapping Template workbook (.xlsx) and per-assessment
   sample CSVs into a mapping-validation fixture for certification-prototype.html.
   Standard library only: an .xlsx is a zip of XML parts, read here directly.

   Usage:
     node build-fixture.mjs --name <id> --workbook <xlsx> \
       --sample "<Assessment Type>=<csv>" [--sample …] \
       [--rename "from=to" …] [--out <prototype.html>]

   With --out, the text between  FIXTURES:BEGIN <id>  and  FIXTURES:END <id>
   markers in the HTML is replaced; otherwise the fixture is printed.
   Test files are fictitious (2026-11-17), so there is no scrub step. Add one
   before converting any real vendor export. */
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

/* ---------- zip ---------- */
function unzip(buf){
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a zip file (no end of central directory).');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i++){
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip central directory.');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    out[name] = method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ---------- xml (just enough for SpreadsheetML) ---------- */
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? decode(m[1]) : null; };
const texts = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map(m => decode(m[1] || '')).join('');

const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const colLetter = i => { let s = ''; i++; while (i){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

export function readXlsx(buf){
  const files = unzip(buf);
  const str = n => files[n] ? files[n].toString('utf8') : '';
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const rels = {};
  for (const m of str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g))
    rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const tabs = {};
  for (const m of str('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)){
    const name = attr(m[0], 'name');
    let target = rels[attr(m[0], 'r:id')] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const grid = [];
    for (const r of str(target).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)){
      const cells = [];
      for (const c of (r[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const tag = '<c' + c[1] + '>';
        const ref = attr(tag, 'r'), type = attr(tag, 't'), body = c[2] || '';
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (type === 's') val = shared[+v] || '';
        else if (type === 'inlineStr') val = texts(body);
        else if (v != null) val = decode(v);
        cells[ref ? colIndex(ref) : cells.length] = val;
      }
      grid.push(cells);
    }
    const header = (grid[0] || []).map(h => (h || '').trim());
    tabs[name] = grid.slice(1)
      .filter(row => row.some(v => v != null && String(v).trim() !== ''))
      .map(row => {
        const o = {};
        row.forEach((v, i) => { if (v != null && v !== '') o[header[i] || colLetter(i)] = v; });
        return o;
      });
  }
  return tabs;
}

/* ---------- csv (quote-aware; from v1's build-sample-data.mjs) ---------- */
export function parseCsv(text){
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (quoted){
      if (ch === '"' && text[i + 1] === '"'){ field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ','){ row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r'){
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length){ row.push(field); if (row.some(c => c !== '')) rows.push(row); }
  const [columns = [], ...rest] = rows;
  rest.forEach(r => { while (r.length < columns.length) r.push(''); });
  return {columns, rows:rest};
}

export function renameAll(value, pairs){
  if (typeof value === 'string') return pairs.reduce((s, [from, to]) => s.split(from).join(to), value);
  if (Array.isArray(value)) return value.map(v => renameAll(v, pairs));
  if (value && typeof value === 'object'){
    const o = {};
    for (const [k, v] of Object.entries(value)) o[renameAll(k, pairs)] = renameAll(v, pairs);
    return o;
  }
  return value;
}

export function toFixture({name, workbook, samples}){
  return {name, workbook, samples};
}

/* ---------- cli ---------- */
function main(argv){
  const opts = {sample:[], rename:[]};
  for (let i = 0; i < argv.length; i += 2){
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if (k === 'sample' || k === 'rename') opts[k].push(v); else opts[k] = v;
  }
  if (!opts.name || !opts.workbook){
    console.error('Usage: node build-fixture.mjs --name <id> --workbook <xlsx> --sample "<Assessment Type>=<csv>" [--rename "from=to"] [--out <html>]');
    process.exit(1);
  }
  const pairs = opts.rename.map(r => { const i = r.indexOf('='); return [r.slice(0, i), r.slice(i + 1)]; });
  const workbook = readXlsx(readFileSync(opts.workbook));
  const samples = {};
  opts.sample.forEach(s => {
    const i = s.indexOf('=');
    const type = s.slice(0, i), file = s.slice(i + 1);
    const parsed = parseCsv(readFileSync(file, 'utf8'));
    samples[type] = {name:file.split(/[\\/]/).pop(), columns:parsed.columns, rows:parsed.rows};
  });
  const fx = renameAll(toFixture({name:opts.name, workbook, samples}), pairs);
  const line = `FIXTURES[${JSON.stringify(opts.name)}] = ${JSON.stringify(fx)};`;
  if (!opts.out){ process.stdout.write(line + '\n'); return; }
  const html = readFileSync(opts.out, 'utf8');
  const begin = `/* FIXTURES:BEGIN ${opts.name} */`, end = `/* FIXTURES:END ${opts.name} */`;
  const a = html.indexOf(begin), b = html.indexOf(end);
  if (a < 0 || b < a){ console.error(`Markers for ${opts.name} not found in ${opts.out}.`); process.exit(1); }
  writeFileSync(opts.out, html.slice(0, a + begin.length) + '\n' + line + '\n' + html.slice(b));
  console.error(`Wrote ${opts.name} into ${opts.out}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
