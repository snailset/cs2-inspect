import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
export function createGroupStore(file,legacyFile){
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
  function write(state){const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(state,null,2));fs.renameSync(temporary,file)}
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(!fs.existsSync(file)){
    const legacy=fs.existsSync(legacyFile)?read(legacyFile):[];
    if(!Array.isArray(legacy))fail('旧搭配数据格式异常，未迁移');
    write({version:1,groups:[{id:'default',name:'默认',items:[...legacy].reverse().map(item=>({...item,id:crypto.randomUUID()}))}]});
  }
  function state(){const s=read(file);if(s.version!==1||!Array.isArray(s.groups)||!s.groups.some(g=>g.id==='default'))fail('组合数据格式异常，请恢复备份',500);return s}
  function group(s,id){const g=s.groups.find(g=>g.id===id);if(!g)fail('组合不存在，请刷新页面',404);return g}
  return {
    list:()=>state().groups.map(g=>({...g,locked:g.id==='default'})),
    get:id=>group(state(),id),
    create(name){const s=state();name=String(name||'').trim();if(!name||name.length>32)fail('组合名称须为 1–32 个字符');if(s.groups.some(g=>g.name===name))fail('已有同名组合');if(s.groups.length>=50)fail('最多保存 50 个组合');const g={id:crypto.randomUUID(),name,items:[]};s.groups.push(g);write(s);return g},
    remove(id,confirmed){if(id==='default')fail('默认组合无法删除');if(confirmed!==true)fail('请确认删除组合');const s=state();group(s,id);s.groups=s.groups.filter(g=>g.id!==id);write(s)},
    save(id,item){const s=state(),g=group(s,id);if(g.items.length>=200)fail('每个组合最多保存 200 件饰品');const v={...item,id:crypto.randomUUID(),date:new Date().toISOString()};g.items.push(v);write(s);return v},
    removeItem(id,itemId){const s=state(),g=group(s,id);if(!g.items.some(i=>i.id===itemId))fail('饰品已不存在，请刷新页面',404);g.items=g.items.filter(i=>i.id!==itemId);write(s)}
  };
}

const pistols=new Set([1,2,3,4,30,32,36,61,63,64]);
export function planGroup(items,validate,lookup){
  if(!items.length)fail('这个组合还没有饰品');
  const choices=new Map();
  for(const raw of items){const v=validate(raw),item=lookup(v),key=item.kind==='weapon'?`weapon:${item.def}`:item.kind;choices.delete(key);choices.set(key,{value:v,item})}
  const equipment=new Map();
  for(const entry of choices.values()){
    const i=entry.item,slot=i.kind==='weapon'?(pistols.has(i.def)?'pistol':i.def===31?'taser':'primary'):i.kind;
    equipment.delete(slot);equipment.set(slot,entry.item);
  }
  // Apply gloves last so their refresh preserves the final selected weapon.
  const equip=[...equipment.entries()].filter(([slot])=>slot!=='glove').map(([,i])=>i);
  if(equipment.has('glove'))equip.push(equipment.get('glove'));
  return {values:[...choices.values()].map(e=>e.value),equip,stored:items.length,duplicates:items.length-choices.size};
}
export async function applyGroupPlan(plan,persist,refresh){
  await persist(plan.values);
  const results=[];
  for(const item of plan.equip){
    try{const result=await refresh(item);results.push({name:item.name,ok:!!result});if(!result)break}
    catch(e){results.push({name:item.name,ok:false,error:e.message});break}
  }
  const refreshed=results.length===plan.equip.length&&results.every(r=>r.ok);
  return {ok:true,refreshed,savedCount:plan.values.length,equippedCount:results.filter(r=>r.ok).length,results,
    notice:refreshed?`整组已应用：${plan.values.length} 件配装已保存，${plan.equip.length} 个装备槽位已更新。`:`整组配装已保存；游戏更新未全部完成，请进入地图并出生后重新应用。${results.find(r=>r.error)?.error||''}`};
}
