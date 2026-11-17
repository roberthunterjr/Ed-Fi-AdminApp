/* Regenerates the SAMPLE_ELA literal in certification-prototype.html from a
   vendor's ELA sample-data CSV (held privately, never committed).
   Usage: node build-sample-data.mjs <path-to-csv> > sample.txt
   Paste the output over the existing `const SAMPLE_ELA = {` … `};` block.

   Anonymization (the repo is public):
   - "Class Teacher(s)" is blanked: synthetic, but it reads like real names
     and nothing maps to it.
   - "Activity Id" is regenerated as VB-ACT-0001 … in row order.
   Everything else is kept: the certification identifiers, Grand Bend school
   IDs and score values are generic Ed-Fi certification data.
   Review the output before committing it. */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file){
  console.error('Usage: node build-sample-data.mjs <path-to-csv>');
  process.exit(1);
}

/* A small quote-aware CSV parser: fields can hold quoted commas and "" escapes. */
function parseCsv(text){
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
  return rows;
}

const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
const [columns, ...rows] = parseCsv(text);
const teacher = columns.indexOf('Class Teacher(s)');
const activity = columns.indexOf('Activity Id');
if (teacher < 0 || activity < 0){
  console.error('Expected "Class Teacher(s)" and "Activity Id" columns.');
  process.exit(1);
}
rows.forEach((r, i) => {
  while (r.length < columns.length) r.push('');
  r[teacher] = '';
  r[activity] = 'VB-ACT-' + String(i + 1).padStart(4, '0');
});

const out = [];
out.push('const SAMPLE_ELA = {name:\'vendorb-ela-sample.csv\',');
out.push('  columns:' + JSON.stringify(columns) + ',');
out.push('  rows:[');
rows.forEach((r, i) => out.push('    ' + JSON.stringify(r) + (i < rows.length - 1 ? ',' : '')));
out.push('  ]};');
process.stdout.write(out.join('\n') + '\n');
