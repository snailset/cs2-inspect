import {secretsPath} from './paths.mjs';
import fs from 'node:fs';import {rcon} from './rcon.mjs';
const s=JSON.parse(fs.readFileSync(secretsPath,'utf8').replace(/^\uFEFF/,''));
let ready=false;const deadline=Date.now()+85000;
while(Date.now()<deadline){try{const status=await rcon('status',s.rconPassword);if(/loaded spawngroup/.test(status)){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,700))}
if(!ready){console.error('Local map did not become ready.');process.exitCode=1}
