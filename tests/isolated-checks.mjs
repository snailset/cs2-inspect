import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {base,readJSON,secretsPath} from './paths.mjs';
const secrets=readJSON(secretsPath);
assert.equal(secrets.database.port,13307,'This test must never use the live database');
const connection=await mysql.createConnection({...secrets.database,connectTimeout:5000});
try{
  const [tables]=await connection.query('SHOW TABLES');assert.equal(tables.length,6);
  const [rows]=await connection.query('SELECT COUNT(*) AS total FROM wp_player_skins');assert.equal(rows[0].total,0);
}finally{await connection.end()}
const url='http://127.0.0.1:17831';
const bootstrap=await (await fetch(`${url}/api/bootstrap`)).json();
assert.equal(bootstrap.catalog.length,2161);
assert.ok(bootstrap.catalog.every(item=>/^\/images\/\d+\/\d+\.png$/.test(item.preview)));
for(const [def,paint] of [[7,44],[515,38],[5030,10037]]){
  const response=await fetch(`${url}/images/${def}/${paint}.png`);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length>1000);
  const second=await fetch(`${url}/images/${def}/${paint}.png`);assert.equal(second.headers.get('x-preview-cache'),'hit');await second.arrayBuffer();
  assert.ok(fs.existsSync(path.join(base,`data/preview-images/${def}-${paint}.png`)));
}
assert.equal((await fetch(`${url}/images/99999/999999.png`)).status,404);
const invalid=await fetch(`${url}/api/refresh`,{method:'POST',headers:{'X-Inspect-Token':'invalid'}});
assert.equal(invalid.status,403);assert.equal((await invalid.json()).code,'SESSION_EXPIRED');
const foreign=await fetch(`${url}/api/refresh`,{method:'POST',headers:{Origin:'https://example.com','X-Inspect-Token':bootstrap.token}});
assert.equal(foreign.status,403);assert.equal((await foreign.json()).code,'ORIGIN_REJECTED');
console.log(JSON.stringify({freshDatabase:true,tables:6,catalog:2161,images:3,cache:true,tokenCheck:true,originCheck:true,gameCommandsSent:false}));
