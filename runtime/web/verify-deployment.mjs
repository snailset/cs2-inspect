// Read-only: never starts/stops the server or applies equipment.
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {readJSON,secretsPath} from './paths.mjs';
import {rcon} from './rcon.mjs';
const secrets=readJSON(secretsPath);
const connection=await mysql.createConnection(secrets.database);
try{const [tables]=await connection.query('SHOW TABLES');assert.ok(tables.length>=6)}finally{await connection.end()}
const bootstrap=await (await fetch('http://127.0.0.1:17830/api/bootstrap')).json();
assert.ok(bootstrap.catalog.length>2000);
for(const kind of ['weapon','knife','glove','agent'])assert.ok(bootstrap.catalog.some(x=>x.kind===kind));
const bridge=await rcon('inspect_ready',secrets.rconPassword);
assert.match(bridge,/INSPECT_READY \d+/);
const status=await rcon('status',secrets.rconPassword);
assert.match(status,/loaded spawngroup/);
console.log(JSON.stringify({database:true,catalog:bootstrap.catalog.length,bridge:true,map:true,changedEquipment:false}));
