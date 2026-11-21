// Copied over rcon.mjs only inside the isolated test installation; no sockets.
import fs from 'node:fs';
import path from 'node:path';
import {base,readJSON,secretsPath} from './paths.mjs';
if(readJSON(secretsPath).database.port!==13307)throw Error('RCON fixture requires the isolated database');
const jobs=new Map();
let map='de_dust2';
export async function rcon(command){
  if(command==='status')return `1 humans\nloaded spawngroup(  1)  : SV:  [1: ${map} | main lump | mapload]`;
  if(command.startsWith('changelevel ')){map=command.split(' ')[1];fs.appendFileSync(path.join(base,'logs/fixture-maps.jsonl'),JSON.stringify({command})+'\n');return ''}
  if(command==='exec inspect_server.cfg'){fs.appendFileSync(path.join(base,'logs/fixture-maps.jsonl'),JSON.stringify({command})+'\n');return ''}
  const args=command.split(' ');
  if(args[0]==='inspect_apply'){
    const [,id,steamId,kind,def]=args;
    if(steamId!=='76561198000000000'||!/^[a-f0-9]{24}$/.test(id))throw Error('Invalid fixture player or job');
    jobs.set(id,{status:'done',focus:['glove','agent'].includes(kind)?'preserved':'selected'});
    fs.appendFileSync(path.join(base,'logs/fixture-applies.jsonl'),JSON.stringify({id,kind,def:Number(def)})+'\n');
    return `INSPECT_ACCEPTED ${id}`;
  }
  if(args[0]==='inspect_result'&&jobs.has(args[1]))return JSON.stringify(jobs.get(args[1]));
  throw Error(`Unexpected fixture command: ${args[0]}`);
}
