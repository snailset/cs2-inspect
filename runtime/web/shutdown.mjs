import {secretsPath} from './paths.mjs';
import fs from 'node:fs';import mysql from 'mysql2/promise';import {rcon} from './rcon.mjs';
const s=JSON.parse(fs.readFileSync(secretsPath,'utf8').replace(/^\uFEFF/,''));
try{await rcon('quit',s.rconPassword)}catch{}
try{const c=await mysql.createConnection({...s.database,user:'root',password:s.rootPassword});await c.query('SHUTDOWN');await c.end()}catch{}
