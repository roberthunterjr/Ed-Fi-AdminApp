/* Regenerates the SIS_V5 literal in certification-prototype.html from a local
   clone of Ed-Fi-Alliance-OSS/certification-testing.
   Usage: node build-collection-data.mjs <path-to-clone>/bruno/SIS/v5 > sis.txt
   Paste the output between the `const SIS_V5 = [` and `];` markers. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2];
const CANON = {S:'isString,isNotEmpty', N:'isNumber,neq 0', A:'isArray,isNotEmpty',
               O:'isDefined', B:'isBoolean'};
const dirs = d => readdirSync(d, {withFileTypes:true})
  .filter(e => e.isDirectory()).map(e => e.name).sort();

function classify(ops){
  const set = new Set(ops);
  if (set.has('isString'))  return 'S';
  if (set.has('isNumber'))  return 'N';
  if (set.has('isArray'))   return 'A';
  if (set.has('isBoolean')) return 'B';
  if (set.has('isDefined')) return 'O';
  return 'X';
}
/* An X entry uses an unusual operator set; infer a display type from it. */
function letterFor(letter, ops){
  if (letter !== 'X') return letter;
  const joined = ops.join(',');
  if (/gte|gt |length|eq \d/.test(joined)) return 'N';
  if (/isUndefined|isJson/.test(joined))   return 'O';
  return 'S';
}

function parseStep(file){
  const t = readFileSync(file, 'utf8');
  const name = (t.match(/^\s*name:\s*(.+)$/m) || [, ''])[1].trim();
  const seq = +(t.match(/^\s*seq:\s*(\d+)/m) || [, 999])[1];
  const assertBlock = t.match(/^assert \{([\s\S]*?)^\}/m);

  let status = 200;
  const byPath = new Map();
  if (assertBlock){
    for (const line of assertBlock[1].split('\n')){
      const m = line.match(/^\s*(res\.[^\s:]*)\s*:\s*(.+?)\s*$/);
      if (!m) continue;
      const [, p, op] = m;
      if (p === 'res.status'){ status = /404/.test(op) ? 404 : 200; continue; }
      /* Strip the body prefix so a list step (res.body[0].x) and a single-resource
         step (res.body.x) share one element spec. */
      const el = p.replace(/^res\.body(\[0\])?\.?/, '');
      if (el === '') continue;
      if (!byPath.has(el)) byPath.set(el, []);
      byPath.get(el).push(op);
    }
  }
  const spec = [...byPath].map(([el, ops]) => {
    const L = letterFor(classify(ops), ops), joined = ops.join(',');
    return joined === CANON[L] ? `${el}:${L}` : `${el}:${L}?${joined}`;
  }).join(';');

  /* expectChanged() in the post-response script is the collection's only value
     check. Some Update steps assert the change out of the parser's reach, so the
     step name is the fallback. */
  const chg = t.match(/expectChanged\([^,]+,[^,]+,\s*'([^']+)'/);
  const src = chg ? chg[1] : (name.match(/- (\S+) was Updated/) || [, ''])[1];
  const changed = src
    ? (src.trim().match(/^[A-Za-z_]\w*(\[\d+\])?(\.\w+(\[\d+\])?)*/) || [src.trim()])[0]
    : '';

  return {name, seq, status, changed, spec};
}

function parseFolder(dir){
  const t = existsSync(path.join(dir, 'folder.bru'))
    ? readFileSync(path.join(dir, 'folder.bru'), 'utf8') : '';
  const seq = +(t.match(/^\s*seq:\s*(\d+)/m) || [, 999])[1];
  /* The collection mixes entity names and prose notes in the same bullet list
     ("* ClassPeriods" next to "* Prior to completing this scenario please ..."),
     with no structural signal separating them. A prerequisite is a short noun
     phrase, so anything longer is treated as a note and dropped. */
  const prereqs = ((t.match(/## Prerequisites([\s\S]*?)(\n\s*##|```)/) || [, ''])[1])
    .split('\n').filter(x => /^\s*\*\s+\S/.test(x))
    .map(x => x.replace(/^\s*\*\s*/, '')
               .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   /* markdown links */
               .replace(/[`_*]/g, '').trim())
    .filter(x => x && !/^none$/i.test(x) && x.length <= 60 && x.split(/\s+/).length <= 6);
  const tasks = ((t.match(/## Scenarios tasks([\s\S]*?)(\n\s*##|```)/) || [, ''])[1])
    .split('\n').map(x => x.trim()).filter(x => /^\d+\./.test(x))
    .map(line => {
      const n = +line.match(/^(\d+)\./)[1];
      let text = line.replace(/^\d+\.\s*/, '').trim();
      /* ~~text~~ marks a task the collection has taken out of scope. */
      const outOfScope = /^~~[\s\S]*~~$/.test(text);
      text = text.replace(/~~/g, '')
                 .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   /* markdown links */
                 .replace(/[`_*]/g, '')                     /* bold and italic markers */
                 .replace(/\s+/g, ' ').trim();
      return [n, text, outOfScope ? 1 : 0];
    });
  return {seq, prereqs, tasks};
}

const BS = String.fromCharCode(92);
const q = s => "'" + String(s).split(BS).join(BS + BS).split("'").join(BS + "'") + "'";
const out = [];
for (const area of dirs(ROOT)){
  for (const scen of dirs(path.join(ROOT, area))){
    const dir = path.join(ROOT, area, scen);
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.bru') && f !== 'folder.bru')
      .map(f => path.join(dir, f));
    if (!files.length) continue;
    const steps = files.map(parseStep).sort((a, b) => a.seq - b.seq);
    const meta = parseFolder(dir);

    let prev = null;
    const stepLines = steps.map(s => {
      let field;
      if (!s.spec) field = "''";
      else if (s.spec === prev) field = "'='";
      else field = q(s.spec);
      if (s.spec) prev = s.spec;
      return `  [${q(s.name)},${s.status},${q(s.changed)},${field}]`;
    });
    const taskLines = meta.tasks.map(([n, text, oos]) => `  [${n},${q(text)},${oos}]`);
    out.push(
      ` [${q(area)},${q(scen)},[\n${stepLines.join(',\n')}],\n` +
      `  {seq:${meta.seq},prereqs:[${meta.prereqs.map(q).join(',')}],tasks:[` +
      (taskLines.length ? `\n${taskLines.join(',\n')}` : '') + `]}]`
    );
  }
}
process.stdout.write(out.join(',\n') + '\n');
