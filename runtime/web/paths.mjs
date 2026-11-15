import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export const settings=readJSON(path.join(base,'data/settings.json'));
export const secretsPath=path.join(base,'data/secrets.json');
