import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MAP='de_dust2';
export const MAPS=Object.freeze([
  ['de_dust2','炙热沙城 II'],['de_mirage','荒漠迷城'],['de_inferno','炼狱小镇'],
  ['de_nuke','核子危机'],['de_overpass','死亡游乐园'],['de_ancient','远古遗迹'],
  ['de_anubis','阿努比斯'],['de_train','列车停放站'],['de_vertigo','殒命大厦'],['de_cache','死城之谜']
].map(([id,name])=>Object.freeze({id,name,icon:`/map-icons/${id}.png`})));

export function getMap(id){
  const map=MAPS.find(map=>map.id===id);
  if(!map){const error=new Error('请选择列表中的地图');error.status=400;throw error}
  return map;
}
export function requireMap(id,mapsPath){
  const map=getMap(id);
  if(!fs.existsSync(path.join(mapsPath,map.id+'.vpk'))){const error=new Error(`缺少地图文件：${map.name}`);error.status=400;throw error}
  return map;
}
export function currentMap(status){
  return /loaded spawngroup\(\s*\d+\)\s*:\s*SV:\s*\[\d+:\s*(de_[a-z0-9_]+)\s*\|/i.exec(status)?.[1]
    || /\bmapname\s*[:=]?\s*(de_[a-z0-9_]+)/i.exec(status)?.[1]
    || /^\s*map\s*:\s*(de_[a-z0-9_]+)/im.exec(status)?.[1] || null;
}
export function createMapSwitcher({mapsPath,send,timeoutMs=60000,intervalMs=750}){
  return async id=>{
    const map=requireMap(id,mapsPath);
    if(currentMap(await send('status'))===map.id)return {ok:true,currentMap:map.id};
    try{await send(`changelevel ${map.id}`)}catch(error){
      // A map transition can close RCON after accepting the command. Poll once;
      // never resend changelevel and accidentally load the same map twice.
      if(!['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE'].includes(error.code)&&!/(关闭了连接|响应超时)/.test(error.message))throw error;
    }
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,intervalMs));
      let status='';try{status=await send('status')}catch{continue}
      if(currentMap(status)!==map.id)continue;
      await send('exec inspect_server.cfg');
      return {ok:true,currentMap:map.id};
    }
    throw new Error('地图切换超时，请稍后重试');
  };
}
