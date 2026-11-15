import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {rcon as sendRcon} from './rcon.mjs';
import {createPreviewCache} from './preview-cache.mjs';
import {MAPS,DEFAULT_MAP,requireMap,currentMap,createMapSwitcher} from './maps.mjs';
import {createGroupStore,planGroup,applyGroupPlan} from './outfit-groups.mjs';
let rconQueue=Promise.resolve();
function rcon(...args){
  const request=rconQueue.then(async()=>{try{return await sendRcon(...args)}catch(e){if(e.code!=='ECONNREFUSED')throw e;await new Promise(r=>setTimeout(r,200));return sendRcon(...args)}});
  rconQueue=request.catch(()=>{});return request;
}
import {base,settings,readJSON} from './paths.mjs';
const web=path.join(base,'web');
const secrets=readJSON(path.join(base,'data/secrets.json'));
const profile=readJSON(path.join(base,'data/profile.json'));
const mapsPath=path.join(base,'server/game/csgo/maps');
const switchMap=createMapSwitcher({mapsPath,send:command=>rcon(command,secrets.rconPassword)});
const listMaps=()=>MAPS.map(map=>({...map,available:fs.existsSync(path.join(mapsPath,map.id+'.vpk'))}));
const pool=mysql.createPool({...secrets.database,connectionLimit:3,connectTimeout:1500});
const data=path.join(base,'server/game/csgo/addons/counterstrikesharp/plugins/WeaponPaints/data');
const rawSkins=readJSON(path.join(data,'skins_zh-CN.json'));
const normalize=(x,kind)=>({def:Number(x.weapon_defindex),paint:Number(x.paint),entity:x.weapon_name||'',name:x.paint_name,kind,group:x.paint_name.split('|')[0].replace(/[（(]★[）)]|★/g,'').trim(),skinName:x.paint_name.split('|').slice(1).join('|').trim()||'原版',image:x.image||''});
const skins=rawSkins.map(x=>normalize(x,Number(x.weapon_defindex)>=500?'knife':'weapon'));
const gloves=readJSON(path.join(data,'gloves_zh-CN.json')).filter(x=>Number(x.weapon_defindex)>0).map(x=>normalize(x,'glove'));
const catalog=[...skins,...gloves];
const previews=createPreviewCache(catalog,path.join(base,'data/preview-images'));
const browserCatalog=catalog.map(({image,...item})=>({...item,preview:`/images/${item.def}/${item.paint}.png`}));
const stickers=readJSON(path.join(data,'stickers_zh-CN.json')).map(x=>({id:Number(x.id),name:x.name}));
const byItem=new Map(catalog.map(x=>[`${x.def}:${x.paint}`,x]));
const stickerIds=new Set([0,...stickers.map(x=>x.id)]);
const presetPath=path.join(base,'data/presets.json');
const groups=createGroupStore(path.join(base,'data/outfit-groups.json'),presetPath);
const apiToken=secrets.webToken||crypto.randomBytes(24).toString('hex');
let operation={running:false,action:'',message:'',error:false};
const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const listening=port=>new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});let done=false;const finish=value=>{if(done)return;done=true;s.destroy();resolve(value)};s.setTimeout(250,()=>finish(false));s.on('error',()=>finish(false));s.on('connect',()=>finish(true))});
function control(action,launchClient=true,mapId=DEFAULT_MAP){
  if(operation.running||skinRequestRunning){const e=new Error('正在应用饰品或启停服务，请稍候');e.status=409;throw e}
  if(action==='start')requireMap(mapId,mapsPath);
  operation={running:true,action,message:action==='start'?'正在启动本地检视…':'正在停止游戏服务…',error:false};
  const file=action==='start'?'Start-From-Panel.ps1':'Stop-Services.ps1';
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(base,'scripts',file),...(action==='stop'?['-KeepPanel']:['-Map',mapId,...(launchClient?[]:['-ServicesOnly'])])];
  const child=spawn(powershell,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,TEMP:settings.tempRoot,TMP:settings.tempRoot}});
  let stdout='',stderr='',finished=false;
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString('utf8')).slice(-65536)});child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-65536)});
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();const message=error?(stderr.trim()||stdout.trim()||String(error)).slice(-1200):action==='start'?'检视服务已启动。游戏进入地图后即可应用饰品。':'检视服务已停止，控制台仍可使用。';operation={running:false,action,message,error:!!error};console.log(new Date().toISOString(),action,error?'failed':'completed')};
  const timer=setTimeout(()=>{child.kill();finish(new Error('启动或停止超时，请查看本地日志'))},150000);
  child.on('error',finish);child.on('exit',code=>finish(code===0?null:new Error(`本地脚本退出码 ${code}`)));
  return {ok:true,operation};
}
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))};
let skinRequestRunning=false;
async function skinAction(action){
  if(operation.running||skinRequestRunning){const e=new Error('操作进行中，请稍候');e.status=409;throw e}
  skinRequestRunning=true;try{return await action()}finally{skinRequestRunning=false}
}
async function changeMap(mapId){
  if(operation.running||skinRequestRunning){const error=new Error('操作进行中，请稍候');error.status=409;throw error}
  requireMap(mapId,mapsPath);
  operation={running:true,action:'map',message:'正在切换地图…',error:false};
  try{const result=await switchMap(mapId);operation={running:false,action:'map',message:'',error:false};return result}
  catch(error){operation={running:false,action:'map',message:error.message,error:true};throw error}
}
async function refresh(item){
  const status=await rcon('status',secrets.rconPassword);if(!/[1-9]\d* humans/.test(status))return null;
  const id=crypto.randomBytes(12).toString('hex');
  const accepted=await rcon(`inspect_apply ${id} ${profile.steamId} ${item?.kind||'current'} ${item?.def||0}`,secrets.rconPassword);
  if(!accepted.includes(`INSPECT_ACCEPTED ${id}`)){
    if(accepted.includes('choose a team'))throw new Error('请先选择阵营并出生，再应用饰品');
    if(accepted.includes('busy'))throw new Error('上一件饰品仍在应用，请稍候');
    throw new Error('定向检视插件尚未就绪，请检查本地服务');
  }
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,150));
    const response=await rcon(`inspect_result ${id}`,secrets.rconPassword);
    const line=response.split(/\r?\n/).find(line=>line.trim().startsWith('{'));
    if(!line)continue;
    const result=JSON.parse(line);
    if(result.status==='done')return result;
    if(result.status==='error')throw new Error(`应用未完成：${result.error}`);
  }
  throw new Error('等待游戏应用超时，请查看游戏状态后重试');
}
function validate(input){
  const item=byItem.get(`${Number(input.def)}:${Number(input.paint)}`);
  if(!item)throw new Error('请选择列表中的有效饰品');
  const seed=Number(input.seed),wear=Number(input.wear);
  if(!Number.isInteger(seed)||seed<0||seed>1000)throw new Error('模板编号须为 0–1000 的整数');
  if(!Number.isFinite(wear)||wear<0||wear>1)throw new Error('磨损须为 0–1');
  const count=Number(input.stattrakCount||0);
  if(!Number.isInteger(count)||count<0||count>2147483647)throw new Error('计数值无效');
  const ss=Array.from({length:5},(_,i)=>{
    const s=(input.stickers||[])[i]||{};const id=Number(s.id||0),w=Number(s.wear||0);
    if(!stickerIds.has(id)||!Number.isFinite(w)||w<0||w>1)throw new Error('贴纸参数无效');
    return {id,wear:w};
  });
  return {def:item.def,paint:item.paint,seed,wear,nametag:String(input.nametag||'').slice(0,32),stattrak:!!input.stattrak,stattrakCount:count,stickers:ss};
}
async function persistItems(entries){
  if(operation.running){const e=new Error('服务正在启动或停止，请完成后再应用');e.status=409;throw e}
  const c=await pool.getConnection();
  try{
    await c.beginTransaction();
    for(const v of entries){
    const item=byItem.get(`${v.def}:${v.paint}`);
    for(const team of [2,3]){
      const columns=['steamid','weapon_team','weapon_defindex','weapon_paint_id','weapon_wear','weapon_seed','weapon_nametag','weapon_stattrak','weapon_stattrak_count',...Array.from({length:5},(_,i)=>`weapon_sticker_${i}`)];
      const values=[profile.steamId,team,v.def,v.paint,v.wear,v.seed,v.nametag,v.stattrak?1:0,v.stattrakCount,...v.stickers.map(s=>`${s.id};0;0;0;${s.wear};1;0`)];
      await c.execute(`INSERT INTO wp_player_skins (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')}) ON DUPLICATE KEY UPDATE ${columns.slice(3).map(k=>`${k}=VALUES(${k})`).join(',')}`,values);
      if(item.kind==='knife')await c.execute('INSERT INTO wp_player_knife (steamid,weapon_team,knife) VALUES (?,?,?) ON DUPLICATE KEY UPDATE knife=VALUES(knife)',[profile.steamId,team,item.entity]);
      if(item.kind==='glove')await c.execute('INSERT INTO wp_player_gloves (steamid,weapon_team,weapon_defindex) VALUES (?,?,?) ON DUPLICATE KEY UPDATE weapon_defindex=VALUES(weapon_defindex)',[profile.steamId,team,v.def]);
    }
    }
    await c.commit();
  }catch(e){await c.rollback();throw e}finally{c.release()}
}
async function apply(input){
  const v=validate(input),item=byItem.get(`${v.def}:${v.paint}`);
  await persistItems([v]);
  let refreshed=false,notice='搭配已保存。进入本地地图后，点击“刷新游戏饰品”即可应用。';
  let applied=null;
  try{applied=await refresh(item);refreshed=!!applied;if(applied)notice=applied.focus==='selected'?`已应用并切换到${item.group}，可直接检视。`:applied.focus==='preserved'?'已应用，并保留当前持有视角。':'已应用；未能确认视角切换，请手动切到对应武器。'}catch(e){notice=`搭配已保存；${e.message}`}
  return {ok:true,refreshed,notice,item:v,applied};
}
async function getState(){
  let database=false,server=false,status='',rows=[];
  const dbUp=await listening(3307);
  if(dbUp)try{await pool.query('SELECT 1');database=true;[rows]=await pool.execute('SELECT weapon_defindex AS def,weapon_paint_id AS paint,weapon_seed AS seed,weapon_wear AS wear,weapon_nametag AS nametag,weapon_stattrak AS stattrak,weapon_stattrak_count AS stattrakCount,weapon_sticker_0,weapon_sticker_1,weapon_sticker_2,weapon_sticker_3,weapon_sticker_4 FROM wp_player_skins WHERE steamid=? AND weapon_team=2',[profile.steamId]);rows=rows.map(row=>({...row,stattrak:!!row.stattrak,stickers:Array.from({length:5},(_,i)=>{const values=String(row[`weapon_sticker_${i}`]||'').split(';');return {id:Number(values[0]||0),wear:Number(values[4]||0)}})}))}catch{}
  try{status=await rcon('status',secrets.rconPassword);server=true}catch{}
  return {database,server,currentMap:currentMap(status),connected:status.includes(profile.steamId)||/[1-9]\d* humans/.test(status),skins:catalog.length,saved:rows,operation,connection:'connect 127.0.0.1:27015'};
}
const server=http.createServer(async(req,res)=>{
  try{
    if(!['127.0.0.1:17830','localhost:17830'].includes(req.headers.host))return json(res,403,{error:'只允许本机访问'});
    const url=new URL(req.url,'http://127.0.0.1:17830');
    if(req.method==='GET'){
      if(url.pathname==='/api/session')return json(res,200,{token:apiToken});
      if(url.pathname==='/api/bootstrap')return json(res,200,{token:apiToken,catalog:browserCatalog,stickers,maps:listMaps()});
      const mapIcon=MAPS.find(map=>url.pathname===map.icon);
      if(mapIcon){const file=path.join(web,'map-icons',mapIcon.id+'.png');if(!fs.existsSync(file))return json(res,404,{error:'地图图标不存在'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});return fs.createReadStream(file).pipe(res)}
      const previewMatch=/^\/images\/(\d{1,5})\/(\d{1,6})\.png$/.exec(url.pathname);
      if(previewMatch){
        try{
          const preview=await previews.get(Number(previewMatch[1]),Number(previewMatch[2]),{retry:url.searchParams.get('retry')==='1'});
          if(res.destroyed)return;
          res.writeHead(200,{'Content-Type':'image/png','Content-Length':preview.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Preview-Cache':preview.cached?'hit':'miss'});
          const stream=fs.createReadStream(preview.file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
        }catch(e){return json(res,e.status||502,{error:'图片暂时无法加载，请稍后重试'})}
      }
      if(url.pathname==='/api/state')return json(res,200,await getState());
      if(url.pathname==='/api/groups')return json(res,200,{groups:groups.list()});
      if(url.pathname==='/api/presets')return json(res,200,groups.list().flatMap(g=>g.items));
      if(url.pathname==='/help'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return fs.createReadStream(path.join(base,'使用说明.md')).pipe(res)}
      const files={'/':'index.html','/app.js':'app.js','/api-client.js':'api-client.js','/map-picker.js':'map-picker.js','/style.css':'style.css'};
      if(files[url.pathname]){const f=files[url.pathname];res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});return fs.createReadStream(path.join(web,f)).pipe(res)}
    }
    if(req.method==='POST'){
      if(!['http://127.0.0.1:17830','http://localhost:17830',undefined].includes(req.headers.origin))return json(res,403,{code:'ORIGIN_REJECTED',error:'请通过本地控制台地址打开页面'});
      if(req.headers['x-inspect-token']!==apiToken)return json(res,403,{code:'SESSION_EXPIRED',error:'页面验证已更新，请重试'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>32768)return json(res,413,{error:'数据过大'})}
      const input=JSON.parse(body||'{}');
      if(url.pathname==='/api/control/start')return json(res,202,control('start',input.launchClient!==false,input.mapId??DEFAULT_MAP));
      if(url.pathname==='/api/control/stop')return json(res,202,control('stop'));
      if(url.pathname==='/api/map')return json(res,200,await changeMap(input.mapId));
      if(url.pathname==='/api/groups/create')return json(res,200,{ok:true,group:groups.create(input.name)});
      if(url.pathname==='/api/groups/delete'){groups.remove(input.groupId,input.confirmed);return json(res,200,{ok:true})}
      if(url.pathname==='/api/groups/item/save'){
        const v=validate(input),item=groups.save(input.groupId,{...v,title:String(input.title||byItem.get(`${v.def}:${v.paint}`).name).slice(0,120)});
        return json(res,200,{ok:true,item});
      }
      if(url.pathname==='/api/groups/item/delete'){groups.removeItem(input.groupId,input.itemId);return json(res,200,{ok:true})}
      if(url.pathname==='/api/groups/apply')return json(res,200,await skinAction(async()=>{
        const plan=planGroup(groups.get(input.groupId).items,validate,v=>byItem.get(`${v.def}:${v.paint}`));
        return applyGroupPlan(plan,persistItems,refresh);
      }));
      if(url.pathname==='/api/apply')return json(res,200,await skinAction(()=>apply(input)));
      if(url.pathname==='/api/refresh'){const applied=await skinAction(()=>refresh());return json(res,200,{ok:true,refreshed:!!applied,applied,notice:applied?'已刷新当前持有的装备。':'请先连接本地服务器并选择阵营，再刷新。'})}
      if(url.pathname==='/api/presets'){
        return json(res,409,{error:'页面已更新，请刷新后选择组合再保存搭配。'});
      }
    }
    json(res,404,{error:'找不到页面'});
  }catch(e){console.error(new Date().toISOString(),e.message);json(res,e.status||400,{error:e.code==='ER_NO_SUCH_TABLE'?'饰品插件尚未完成初始化，请先启动服务器。':['ECONNREFUSED','ETIMEDOUT'].includes(e.code)?'本地服务尚未启动，请先点击“启动检视”。':e.message})}
});
server.listen(17830,'127.0.0.1',()=>console.log('CS2 本地检视面板 http://127.0.0.1:17830'));
async function close(){server.close();await pool.end();process.exit(0)}
process.on('SIGTERM',close);process.on('SIGINT',close);
