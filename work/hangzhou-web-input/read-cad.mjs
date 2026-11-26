import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCadReference} from '../../outputs/SW支撑布置插件_正式首版/src/engine/cad-reference.js';

// Optional upstream conversion: dwg2dxf -o reference.dxf hangzhou-input.dwg.
// The project also ships the converted ASCII DXF.
const folder = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] || path.join(folder, 'reference.dxf');
const destination = process.argv[3] || path.join(folder, 'cad.json');
const raw = fs.readFileSync(source);
if (raw.subarray(0,22).includes(0)) throw Error('Expected ASCII DXF');

// Normalize line endings as bytes. parseCadReference determines UTF-8/GB18030.
const lines = raw.toString('latin1').replace(/\r+\n|\r/g, '\n').split('\n');
let first = 0;
while (first+1 < lines.length && lines[first].trim() === '999') first += 2;
const result = parseCadReference(Buffer.from(lines.slice(first).join('\n'), 'latin1'));
fs.writeFileSync(destination, JSON.stringify(result));
console.log(`Read ${result.features.length} closed outlines`);
