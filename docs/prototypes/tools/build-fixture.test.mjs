import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readXlsx, sampleFromXlsx, parseCsv, renameAll } from './build-fixture.mjs';

/* Builds a minimal .xlsx in memory: a zip of deflated XML parts with shared
   strings. Rows are arrays; a hole or undefined leaves the cell out. */
function makeXlsx(tabs){
  const names = Object.keys(tabs);
  const strings = [];
  const si = s => { let i = strings.indexOf(s); if (i < 0){ i = strings.length; strings.push(s); } return i; };
  const col = n => String.fromCharCode(65 + n);
  const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const files = {};
  names.forEach((name, t) => {
    const rows = tabs[name].map((r, ri) => {
      const cells = [];
      for (let ci = 0; ci < r.length; ci++){
        if (r[ci] === undefined) continue;
        /* {n:'254.0'} is a numeric cell stored the way a tool wrote it. */
        cells.push(r[ci] && typeof r[ci] === 'object'
          ? `<c r="${col(ci)}${ri + 1}"><v>${r[ci].n}</v></c>`
          : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(r[ci])}</v></c>`);
      }
      return `<row r="${ri + 1}">${cells.join('')}</row>`;
    }).join('');
    files[`xl/worksheets/sheet${t + 1}.xml`] =
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files['xl/sharedStrings.xml'] = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    strings.map(s => `<si><t>${xml(s)}</t></si>`).join('') + '</sst>';
  files['xl/workbook.xml'] = '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
  files['xl/_rels/workbook.xml.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names.map((n, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml" ` +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>').join('') + '</Relationships>';
  files['[Content_Types].xml'] = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';

  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)){
    const raw = Buffer.from(text, 'utf8');
    const data = zlib.deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('readXlsx returns tabs as header-keyed rows', () => {
  const buf = makeXlsx({EnumerationItems:[['Enumeration', 'Code Value '], ['EventCircumstance', 'Red Rush Flag'], []]});
  assert.deepEqual(readXlsx(buf).EnumerationItems, [{Enumeration:'EventCircumstance', 'Code Value':'Red Rush Flag'}]);
});

test('readXlsx names an unheaded column by its letter', () => {
  const row = ['Scale Score'];
  row[7] = '"x": "y"';
  const buf = makeXlsx({ElementDefinitions:[['Element'], row]});
  assert.equal(readXlsx(buf).ElementDefinitions[0].H, '"x": "y"');
});

test('numeric cells read as Excel General shows them', () => {
  const buf = makeXlsx({Sheet1:[['Code', 'Score'], [{n:'1.435148917E9'}, {n:'254.0'}], [{n:'0.5'}, {n:'22'}]]});
  assert.deepEqual(readXlsx(buf).Sheet1, [{Code:'1435148917', Score:'254'}, {Code:'0.5', Score:'22'}]);
});

test('sampleFromXlsx reads the first sheet like a CSV, keeping column order and blanks', () => {
  const row = ['K', {n:'254.0'}];
  row[3] = 'x';
  const buf = makeXlsx({Sheet1:[['Grade', 'Score', 'Empty', 'Note'], row, []], Other:[['ignored']]});
  assert.deepEqual(sampleFromXlsx(buf),
    {columns:['Grade', 'Score', 'Empty', 'Note'], rows:[['K', '254', '', 'x']]});
});

test('parseCsv keeps quoted commas and strips a BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y",2\n'), {columns:['a', 'b'], rows:[['x, y', '2']]});
});

test('renameAll replaces in every nested string', () => {
  assert.deepEqual(renameAll({a:['RealVendor ELA'], b:{c:'uri://realvendor.example/X'}},
    [['RealVendor', 'Vendor B'], ['uri://realvendor.example/', 'uri://vendorb.example/']]),
    {a:['Vendor B ELA'], b:{c:'uri://vendorb.example/X'}});
});
