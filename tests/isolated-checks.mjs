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
let previewDownloads=0;
for(const [def,paint] of [[7,44],[515,38],[5030,10037]]){
  const response=await fetch(`${url}/images/${def}/${paint}.png`);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  if(response.headers.get('x-preview-cache')==='miss')previewDownloads++;
  const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length>1000);
  const second=await fetch(`${url}/images/${def}/${paint}.png`);assert.equal(second.headers.get('x-preview-cache'),'hit');await second.arrayBuffer();
  assert.ok(fs.existsSync(path.join(base,`data/preview-images/${def}-${paint}.png`)));
}
assert.equal((await fetch(`${url}/images/99999/999999.png`)).status,404);
const invalid=await fetch(`${url}/api/refresh`,{method:'POST',headers:{'X-Inspect-Token':'invalid'}});
assert.equal(invalid.status,403);assert.equal((await invalid.json()).code,'SESSION_EXPIRED');
const foreign=await fetch(`${url}/api/refresh`,{method:'POST',headers:{Origin:'https://example.com','X-Inspect-Token':bootstrap.token}});
assert.equal(foreign.status,403);assert.equal((await foreign.json()).code,'ORIGIN_REJECTED');
const post=async(route,body,status=200)=>{
  const response=await fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Inspect-Token':bootstrap.token},body:JSON.stringify(body)});
  const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
};
const list=async()=>(await (await fetch(url+'/api/groups')).json()).groups;
const initial=await list();assert.equal(initial.length,1);assert.equal(initial[0].id,'default');assert.equal(initial[0].locked,true);assert.equal(initial[0].items.length,0);
await post('/api/groups/delete',{groupId:'default',confirmed:true},400);
const group=(await post('/api/groups/create',{name:'整组测试'})).group;
await post('/api/groups/create',{name:'整组测试'},400);
await post('/api/groups/apply',{groupId:group.id},400);
const picks=[[7,44],[61,818],[515,38],[5030,10073]].map(([def,paint])=>({def,paint,seed:7,wear:0.03}));
await post('/api/groups/item/save',picks[0],404);
for(const item of picks)await post('/api/groups/item/save',{...item,groupId:group.id});
const applied=await post('/api/groups/apply',{groupId:group.id});
assert.equal(applied.refreshed,true);assert.equal(applied.savedCount,4);assert.equal(applied.equippedCount,4);
const db=await mysql.createConnection({...secrets.database,connectTimeout:5000});
try{
  const [rows]=await db.query('SELECT weapon_team,weapon_defindex,weapon_paint_id FROM wp_player_skins ORDER BY weapon_team,weapon_defindex');
  assert.equal(rows.length,8);
  for(const team of [2,3])for(const item of picks)assert.ok(rows.some(r=>r.weapon_team===team&&r.weapon_defindex===item.def&&r.weapon_paint_id===item.paint));
  const [knives]=await db.query('SELECT knife FROM wp_player_knife');assert.equal(knives.length,2);assert.ok(knives.every(r=>r.knife==='weapon_knife_butterfly'));
  const [gloves]=await db.query('SELECT weapon_defindex FROM wp_player_gloves');assert.equal(gloves.length,2);assert.ok(gloves.every(r=>r.weapon_defindex===5030));
}finally{await db.end()}
const calls=fs.readFileSync(path.join(base,'logs/fixture-applies.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
assert.deepEqual(calls.map(c=>c.def),[7,61,515,5030]);assert.equal(new Set(calls.map(c=>c.id)).size,4);
const saved=(await list()).find(g=>g.id===group.id);
await post('/api/groups/item/delete',{groupId:group.id,itemId:saved.items[0].id});
assert.equal((await list()).find(g=>g.id===group.id).items.length,3);
await post('/api/groups/delete',{groupId:group.id},400);
assert.ok((await list()).some(g=>g.id===group.id));
await post('/api/groups/delete',{groupId:group.id,confirmed:true});
assert.deepEqual((await list()).map(g=>g.id),['default']);
await post('/api/presets',picks[0],409);
assert.equal(bootstrap.maps.length,10);assert.equal(bootstrap.maps[0].id,'de_dust2');assert.ok(bootstrap.maps.every(map=>map.available));
for(const map of bootstrap.maps){const icon=await fetch(url+map.icon);assert.equal(icon.status,200);assert.equal(icon.headers.get('content-type'),'image/png');assert.ok((await icon.arrayBuffer()).byteLength>1000)}
assert.equal((await fetch(url+'/map-icons/de_ancient_night.png')).status,404);
await post('/api/map',{mapId:'de_dust2;quit'},400);await post('/api/map',{mapId:'de_ancient_night'},400);
const pendingMap=post('/api/map',{mapId:'de_mirage'});
let changing=false;
for(let i=0;i<20;i++){const state=await (await fetch(url+'/api/state')).json();if(state.operation.running){changing=true;break}await new Promise(resolve=>setTimeout(resolve,10))}
assert.ok(changing,'Map transition should hold the operation lock');
await post('/api/refresh',{},409);await post('/api/control/stop',{},409);
assert.equal((await pendingMap).currentMap,'de_mirage');
assert.equal((await (await fetch(url+'/api/state')).json()).currentMap,'de_mirage');
assert.equal((await post('/api/map',{mapId:'de_dust2'})).currentMap,'de_dust2');
const mapCommands=fs.readFileSync(path.join(base,'logs/fixture-maps.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).command);
assert.deepEqual(mapCommands,['changelevel de_mirage','exec inspect_server.cfg','changelevel de_dust2','exec inspect_server.cfg']);
console.log(JSON.stringify({freshDatabase:true,tables:6,catalog:2161,images:3,previewDownloads,cache:true,tokenCheck:true,originCheck:true,groups:true,defaultProtected:true,rifleAndPistol:true,teams:2,skinRows:8,knifeAndGlove:true,singleUpdatePerSlot:true,maps:10,mapIcons:10,mapSwitch:true,mapLock:true,mapAllowlist:true,gameCommandsSent:false}));
