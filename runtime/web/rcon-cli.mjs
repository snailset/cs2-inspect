import {secretsPath} from './paths.mjs';
import fs from 'node:fs';import {rcon} from './rcon.mjs';
const s=JSON.parse(fs.readFileSync(secretsPath,'utf8').replace(/^\uFEFF/,''));
try{console.log(await rcon(process.argv.slice(2).join(' '),s.rconPassword))}catch(e){console.error(e.message);process.exitCode=1}
