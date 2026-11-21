import {createApi} from './api-client.js';
import {createMapPicker} from './map-picker.js';
let mapPicker,mapRequestBusy=false;
const syncMapControls=()=>mapPicker?.sync({busy:busy||skinRequestBusy||mapRequestBusy,server:serviceState.server,currentMap:serviceState.currentMap});
const $=id=>document.getElementById(id),api=createApi();
let catalog=[],stickers=[],kind='weapon',selected,presets=[],saved=[],busy=false,healthPending=false,skinRequestBusy=false,lastListKey='',previewVersion=0,groups=[],activeGroup='default',selectedPresetId='',groupMutationBusy=false,serviceState={},pendingSave=null,pendingDelete='';
const notice=(text,type='')=>{$('notice').textContent=text;$('notice').className=type};
const blank={seed:0,nametag:'',stattrak:false,stattrakCount:0,stickers:[]};
const tabDrafts=new Map();
const categoryKey=item=>item.kind==='agent'?item.team:item.def;
const teamName=team=>team===2?'T':'CT';
const inCategory=(item,value)=>item.kind===kind&&categoryKey(item)===value;
const grades=[
  ['崭新',[0,1,2,3,4,7]],['略磨',[7,8,9,10,11,15]],
  ['久经',[15,18,21,24,27,38]],['破损',[38,39,40,41,42,45]],['战痕',[45,50,63,76,90,100]]
];
let grade=1,band=4;
function randomWear(g,b){
  const edges=grades[g][1],low=edges[b]*100,high=edges[b+1]*100;
  return ((low+Math.floor(Math.random()*(high-low+(high===10000?1:0))))/10000).toFixed(4);
}
function wearButton(label,color,pressed,click){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;button.className='weargrade-'+color;
  button.setAttribute('aria-pressed',String(pressed));button.onclick=click;
  return button;
}
function renderWear(){
  $('weargrades').replaceChildren(...grades.map(([label],g)=>wearButton(label,g,g===grade,()=>{
    grade=g;band=-1;renderWear();$('weargrades').children[g].focus();
  })));
  const edges=grades[grade][1];
  $('wearbands').replaceChildren(...edges.slice(0,-1).map((lo,b)=>{
    const label=(lo/100).toFixed(2)+'–'+(edges[b+1]/100).toFixed(2);
    return wearButton(label,grade,b===band,()=>{
      band=b;$('wear').value=randomWear(grade,band);$('wearslider').value=$('wear').value;
      renderWear();$('wearbands').children[b].focus();
    });
  }));
}
function locateWear(){
  const wear=$('wear').valueAsNumber;
  const g=grades.findIndex(([,edges])=>wear>=edges[0]/100 && (wear<edges[5]/100 || wear===1&&edges[5]===100));
  if(g>=0)grade=g;
  band=g<0?-1:grades[g][1].slice(1).findIndex(high=>wear<high/100 || wear===1&&high===100);
  renderWear();
}
function values(){
  if(!selected)throw new Error('请先选择饰品');
  if(selected.kind==='agent')return {def:selected.def,paint:selected.paint};
  return {def:selected.def,paint:selected.paint,seed:Number($('seed').value),wear:Number($('wear').value),nametag:selected.kind==='glove'?'':$('nametag').value,stattrak:selected.kind==='glove'?false:$('stattrak').checked,stattrakCount:Number($('stattrakCount').value),stickers:Array.from({length:5},(_,i)=>({id:selected.kind==='weapon'?Number($(`sticker${i}`).value.split(' · ')[0]||0):0,wear:Number($(`scrape${i}`).value||0)}))};
}
function rememberTab(){
  if(!selected)return;
  const fields=[...$('form').querySelectorAll('input')].map(el=>[el.id,el.value,el.checked]);
  tabDrafts.set(kind,{item:selected,fields,category:$('category').value,query:$('search').value,
    scroll:$('items').scrollTop,details:$('stickersection').open,
    preset:selectedPresetId,grade,band,group:activeGroup});
}
function showPreview(item,retry=false){
  const version=++previewVersion,previous=$('previewimage');
  const image=document.createElement('img');image.id='previewimage';image.alt=item.name;image.decoding='async';image.fetchPriority='high';image.hidden=true;
  previous.replaceWith(image);$('monogram').textContent=item.group;$('monogram').hidden=false;$('previewstatus').textContent='正在加载图片…';$('previewretry').hidden=true;$('previewbox').classList.add('loading');
  image.onload=()=>{if(version!==previewVersion)return;image.hidden=false;$('monogram').hidden=true;$('previewstatus').textContent='';$('previewbox').classList.remove('loading')};
  image.onerror=()=>{if(version!==previewVersion)return;image.hidden=true;$('previewstatus').textContent='图片暂时无法加载';$('previewretry').hidden=false;$('previewbox').classList.remove('loading')};
  image.src=item.preview+(retry?'?retry=1':'');
}
function pick(item,v){
  selectedPresetId=v?.id||'';selected=item;const match=saved.find(x=>x.def===item.def&&x.paint===item.paint),input={...blank,...(v||match||{})};
  const agent=item.kind==='agent';
  if(!agent)input.wear=v?.wear??randomWear(1,4);
  $('selected').textContent=item.name;$('itemmeta').textContent=`${item.group} · 皮肤编号 ${item.paint}`;
  if(agent)$('itemmeta').textContent=item.team===2?'探员 · T':'探员 · CT';
  showPreview(item);$('form').hidden=false;
  $('finishfields').hidden=agent;$('finishfields').disabled=agent;
  $('stickersection').hidden=item.kind!=='weapon';$('weaponextras').hidden=item.kind==='glove'||agent;
  for(const k of ['seed','wear','nametag','stattrakCount'])$(k).value=input[k]??'';
  $('stattrak').checked=!!input.stattrak;$('seedslider').value=input.seed;
  if(!agent){$('wearslider').value=input.wear;locateWear()}
  for(let i=0;i<5;i++){const s=input.stickers?.[i]||{id:0,wear:0};const match=stickers.find(x=>x.id===s.id);$(`sticker${i}`).value=match?`${match.id} · ${match.name}`:'';$(`scrape${i}`).value=s.wear||0}
  renderItems();
}
function renderGroups(preferred){
  const agent=kind==='agent';
  $('groupcontrols').hidden=kind!=='presets';$('selectors').hidden=kind==='presets';
  $('categorylabel').textContent=agent?'1 · 选择阵营':kind==='glove'?'1 · 选择手套类型':kind==='knife'?'1 · 选择刀具类型':'1 · 选择枪械';
  $('itemlabel').textContent=agent?'2 · 选择探员':'2 · 选择皮肤';
  $('search').placeholder=agent?'搜索探员名称或编号':'搜索名称或皮肤编号';
  $('search').setAttribute('aria-label',$('search').placeholder);
  $('items').setAttribute('aria-label',agent?'二级：具体探员':kind==='presets'?'组合饰品':'二级：具体皮肤');
  const groups=new Map();
  for(const item of catalog.filter(x=>x.kind===kind)){
    const key=categoryKey(item);
    if(!groups.has(key))groups.set(key,{label:agent?teamName(item.team):item.group,count:0});
    groups.get(key).count++;
  }
  const options=[...groups];
  if(agent)options.sort(([a],[b])=>a-b);
  $('category').replaceChildren(...options.map(([key,g])=>new Option(`${g.label} · ${g.count} 款`,key)));
  if(groups.has(Number(preferred)))$('category').value=String(preferred);
}
function renderItems(){
  const category=Number($('category').value),query=$('search').value.trim().toLowerCase();
  const key=`${kind}|${category}|${query}|${kind==='presets'?activeGroup+'|'+presets.map(p=>p.id).join(','):''}`;
  const mark=()=>{for(const button of $('items').querySelectorAll('button.item')){const chosen=kind==='presets'?button.dataset.preset===selectedPresetId:button.dataset.item===`${selected?.def}:${selected?.paint}`;button.classList.toggle('chosen',chosen);button.setAttribute('aria-pressed',String(chosen))}};
  if(key===lastListKey){mark();return}lastListKey=key;
  const list=kind==='presets'?[...presets].reverse().map(v=>({...catalog.find(x=>x.def===v.def&&x.paint===v.paint),preset:v})):catalog.filter(x=>inCategory(x,category));
  const found=list.filter(x=>kind==='presets'||`${x.name} ${kind==='agent'?x.def:x.paint}`.toLowerCase().includes(query));
  $('count').textContent=`${found.length} 款`;$('groupname').textContent=kind==='agent'?teamName(category):list[0]?.group||'';$('items').replaceChildren();
  if(!found.length){const p=document.createElement('p');p.className='empty';p.textContent=kind==='presets'?'暂无饰品':kind==='agent'?'没有匹配的探员':'没有匹配的皮肤';$('items').append(p)}
  for(const item of found){
    const b=document.createElement('button');b.className='item';b.dataset.item=`${item.def}:${item.paint}`;b.dataset.preset=item.preset?.id||'';
    const thumb=document.createElement('span');thumb.className='thumbnail loading';const fallback=document.createElement('span');fallback.className='thumbfallback';fallback.textContent='预览';
    const image=document.createElement('img');image.alt='';image.loading='lazy';image.decoding='async';image.width=88;image.height=64;
    image.onload=()=>{thumb.classList.remove('loading');fallback.hidden=true};image.onerror=()=>{thumb.classList.remove('loading');image.hidden=true;fallback.textContent='暂无图片'};if(item.preview)image.src=item.preview;else{image.hidden=true;fallback.textContent='款式不可用'}
    thumb.append(fallback,image);const text=document.createElement('span');text.className='itemtext';const name=document.createElement('span');name.className='itemname';name.textContent=item.preset?.title||item.skinName;const meta=document.createElement('span');meta.className='sub';meta.textContent=item.kind==='agent'?teamName(item.team)+' · #'+item.def:item.preset?`模板 ${item.preset.seed} · ${item.group}`:`${item.group} · #${item.paint}`;text.append(name,meta);b.append(thumb,text);b.onclick=()=>{if(item.name)pick(item,item.preset);else notice('当前饰品库中已找不到这个款式','error')};if(item.preset){const row=document.createElement('div');row.className='presetrow';const remove=document.createElement('button');remove.className='iconbutton secondary danger';remove.type='button';remove.title='移出组合';remove.setAttribute('aria-label',`移出饰品：${item.preset.title}`);remove.innerHTML=trashIcon;remove.onclick=()=>removeGroupItem(item.preset.id);row.append(b,remove);$('items').append(row)}else $('items').append(b);
  }
  mark();
}
async function health(){
  if(healthPending)return;healthPending=true;
  try{
    const s=await api('/api/state');saved=s.saved;busy=s.operation.running||mapRequestBusy;serviceState=s;
    $('health').textContent=s.connected?'● 已连接本机检视服':s.server?'● 检视服务已启动':'○ 检视服务未启动';$('health').className='status'+(s.server?' ok':'');
    const mapName=mapNames.get(s.currentMap);if(mapName)$('health').textContent+=' · '+mapName;
    $('servicehint').textContent='';
    $('start').disabled=busy;$('stop').disabled=busy||(!s.server&&!s.database);$('apply').disabled=busy||skinRequestBusy||!s.database;$('refresh').disabled=busy||skinRequestBusy||!s.server;
    syncGroupButtons();$('controlnotice').textContent=s.operation.running||s.operation.error?s.operation.message||'':'';$('controlnotice').className=s.operation.error?'error':'';return s;
  }catch{$('health').textContent='○ 控制台后台未连接';$('servicehint').textContent='请重新打开部署目录中的“打开检视控制台.cmd”。';$('start').disabled=true;$('stop').disabled=true;$('apply').disabled=true;serviceState={};syncGroupButtons()}
  finally{healthPending=false}
}
$('tabs').onclick=async e=>{
  const next=e.target.dataset.kind;if(!next||next===kind)return;
  rememberTab();kind=next;selected=null;selectedPresetId='';notice('');
  for(const button of $('tabs').children)button.classList.toggle('active',button.dataset.kind===kind);
  const draft=tabDrafts.get(kind);
  $('search').value=draft?.query||'';renderGroups(draft?.category);
  try{
    if(next==='presets'){await loadGroups(draft?.group||activeGroup);if(kind!==next)return}
    const preset=kind==='presets'?(presets.find(p=>p.id===draft?.preset)||presets.at(-1)):null;
    const restore=draft&&(kind!=='presets'||preset?.id===draft.preset);
    const item=kind==='presets'?catalog.find(x=>x.def===preset?.def&&x.paint===preset?.paint):
      restore?draft.item:catalog.find(x=>inCategory(x,Number($('category').value)));
    if(item){
      pick(item,preset);
      if(restore){
        for(const [id,value,checked] of draft.fields){$(id).value=value;$(id).checked=checked}
        grade=draft.grade;band=draft.band;renderWear();
      }
    }else{
      ++previewVersion;$('previewimage').hidden=true;$('monogram').hidden=true;$('previewstatus').textContent='';
      $('previewretry').hidden=true;$('previewbox').classList.remove('loading');
      $('selected').textContent='选择搭配';$('itemmeta').textContent='';$('form').hidden=true;
    }
    $('stickersection').open=!!draft?.details;renderItems();
    $('items').scrollTop=draft?.scroll||0;
  }catch(e){notice(e.message,'error')}
};
$('category').onchange=()=>{$('search').value='';pick(catalog.find(x=>inCategory(x,Number($('category').value))));$('items').scrollTop=0};$('search').oninput=renderItems;
$('seedslider').oninput=()=>{$('seed').value=$('seedslider').value};
$('seed').oninput=()=>{$('seedslider').value=$('seed').value};
$('wearslider').oninput=()=>{$('wear').value=$('wearslider').value;locateWear()};
$('wear').oninput=()=>{$('wearslider').value=$('wear').value;locateWear()};
$('form').onsubmit=async e=>{e.preventDefault();if(skinRequestBusy||busy)return;skinRequestBusy=true;syncMapControls();$('apply').disabled=true;$('refresh').disabled=true;notice('正在应用饰品…');try{const r=await api('/api/apply',values());notice(r.refreshed&&['selected','preserved'].includes(r.applied?.focus)?'已应用':r.notice,r.refreshed?'success':'')}catch(e){notice(e.message,'error')}finally{skinRequestBusy=false;await health()}};
$('save').onclick=async()=>{if(groupMutationBusy||!$('form').reportValidity())return;try{pendingSave={...values(),title: selected.kind==='agent'?selected.name:selected.name+' · 模板 '+$('seed').value+' · '+$('wear').value};await loadGroups();$('savingitem').textContent=pendingSave.title;$('savegrouperror').textContent='';$('savegroupdialog').showModal()}catch(e){notice(e.message,'error')}};
$('refresh').onclick=async()=>{if(skinRequestBusy||busy)return;skinRequestBusy=true;syncMapControls();$('apply').disabled=true;$('refresh').disabled=true;try{const r=await api('/api/refresh',{});notice(r.refreshed?'已刷新':r.notice,r.refreshed?'success':'')}catch(e){notice(e.message,'error')}finally{skinRequestBusy=false;await health()}};
async function control(action){if(busy)return;busy=true;$('start').disabled=true;$('stop').disabled=true;$('controlnotice').textContent=action==='start'?'正在启动，请稍候…':'正在停止检视服务…';try{await api(`/api/control/${action}`,action==='start'?{mapId:mapPicker?.value||'de_dust2'}:{});await health()}catch(e){busy=false;$('controlnotice').textContent=e.message;$('controlnotice').className='error';await health()}}
$('changemap').onclick=async()=>{
  if(busy||skinRequestBusy||mapRequestBusy)return;
  mapRequestBusy=true;busy=true;syncGroupButtons();$('start').disabled=true;$('stop').disabled=true;$('apply').disabled=true;$('refresh').disabled=true;
  $('controlnotice').className='';$('controlnotice').textContent='正在切换地图…';
  try{await api('/api/map',{mapId:mapPicker.value})}catch(e){$('controlnotice').textContent=e.message;$('controlnotice').className='error'}
  finally{mapRequestBusy=false;await health()}
};
const mapNames=new Map();
$('start').onclick=()=>control('start');$('stop').onclick=()=>control('stop');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText('connect 127.0.0.1:27015');$('copy').textContent='已复制';setTimeout(()=>$('copy').textContent='复制连接指令',1800)}catch{notice('请手动复制页面上的连接指令')}};
$('previewretry').onclick=()=>{if(selected)showPreview(selected,true)};
const trashIcon='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
$('deletegroup').innerHTML=trashIcon;
function currentGroup(){return groups.find(g=>g.id===activeGroup)}
function groupNotice(message,error=false){$('groupnotice').textContent=message;$('groupnotice').className=error?'error':'success'}
function syncGroupButtons(){
  syncMapControls();
  const g=currentGroup(),locked=busy||skinRequestBusy;
  $('applygroup').disabled=locked||groupMutationBusy||!serviceState.database||!g?.items.length;
  $('deletegroup').disabled=groupMutationBusy||!g||g.locked;
  $('deletegroup').title='删除组合';$('deletegroup').hidden=!!g?.locked;
  $('newgroup').disabled=groupMutationBusy;$('save').disabled=groupMutationBusy;
  for(const id of ['confirmsave','confirmnewgroup','confirmdeletegroup'])$(id).disabled=groupMutationBusy;
  for(const b of $('items').querySelectorAll('.presetrow > .iconbutton'))b.disabled=groupMutationBusy;
}
async function loadGroups(preferred=activeGroup){
  groups=(await api('/api/groups')).groups;
  activeGroup=groups.some(g=>g.id===preferred)?preferred:'default';
  $('outfitgroup').replaceChildren(...groups.map(g=>new Option(`${g.name}（${g.items.length}）`,g.id)));
  $('outfitgroup').value=activeGroup;
  $('savegroupselect').replaceChildren(...groups.map(g=>new Option(g.name,g.id)));$('savegroupselect').value=activeGroup;
  presets=currentGroup()?.items||[];if(kind==='presets')renderItems();syncGroupButtons();
}
async function mutateGroup(action,errorTarget){
  if(groupMutationBusy)return;groupMutationBusy=true;syncGroupButtons();
  try{await action()}catch(e){if(errorTarget)$(errorTarget).textContent=e.message;else groupNotice(e.message,true)}
  finally{groupMutationBusy=false;syncGroupButtons()}
}
$('outfitgroup').onchange=()=>{activeGroup=$('outfitgroup').value;presets=currentGroup()?.items||[];selectedPresetId='';$('groupnotice').textContent='';renderItems();syncGroupButtons()};
$('newgroup').onclick=()=>{$('newgroupname').value='';$('newgrouperror').textContent='';$('newgroupdialog').showModal()};
$('newgroupform').onsubmit=e=>{e.preventDefault();mutateGroup(async()=>{const r=await api('/api/groups/create',{name:$('newgroupname').value});await loadGroups(r.group.id);$('newgroupdialog').close();groupNotice('组合已创建')},'newgrouperror')};
$('savegroupform').onsubmit=e=>{e.preventDefault();mutateGroup(async()=>{const groupId=$('savegroupselect').value;if(!groupId)throw new Error('请选择组合');await api('/api/groups/item/save',{...pendingSave,groupId});await loadGroups(groupId);$('savegroupdialog').close();if(kind==='presets'){notice('');groupNotice('已保存')}else notice(`已保存到“${currentGroup().name}”`,'success')},'savegrouperror')};
$('deletegroup').onclick=()=>{const g=currentGroup();if(!g||g.locked)return;pendingDelete=g.id;$('deletegroupmessage').textContent=`将删除“${g.name}”及其中 ${g.items.length} 件饰品。`;$('deletegrouperror').textContent='';$('deletegroupdialog').showModal()};
$('confirmdeletegroup').onclick=()=>mutateGroup(async()=>{await api('/api/groups/delete',{groupId:pendingDelete,confirmed:true});await loadGroups('default');$('deletegroupdialog').close();groupNotice('组合已删除')},'deletegrouperror');
function removeGroupItem(itemId){const groupId=activeGroup;return mutateGroup(async()=>{await api('/api/groups/item/delete',{groupId,itemId});if(selectedPresetId===itemId)selectedPresetId='';await loadGroups();groupNotice('已移除')})}
$('applygroup').onclick=async()=>{
  if(skinRequestBusy||busy||!currentGroup()?.items.length)return;
  skinRequestBusy=true;syncGroupButtons();$('apply').disabled=true;$('refresh').disabled=true;
  groupNotice(`正在应用“${currentGroup().name}”…`);
  try{const r=await api('/api/groups/apply',{groupId:activeGroup});groupNotice(r.refreshed?'整组已应用':r.notice,!r.refreshed)}catch(e){groupNotice(e.message,true)}
  finally{skinRequestBusy=false;await health();syncGroupButtons()}
};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();

async function boot(){try{
  const b=await api('/api/bootstrap');catalog=b.catalog;stickers=b.stickers;
  for(const map of b.maps)mapNames.set(map.id,map.name);mapPicker=createMapPicker(b.maps);
  const frag=document.createDocumentFragment();for(const s of stickers){const o=document.createElement('option');o.value=`${s.id} · ${s.name}`;frag.append(o)}$('stickernames').append(frag);
  for(let i=0;i<5;i++){const row=document.createElement('div');row.className='stickerrow';const input=document.createElement('input');input.id=`sticker${i}`;input.setAttribute('list','stickernames');input.placeholder=`贴纸 ${i+1}：名称或编号`;input.setAttribute('aria-label',`贴纸 ${i+1}`);const wear=document.createElement('input');wear.id=`scrape${i}`;wear.type='number';wear.min='0';wear.max='1';wear.step='any';wear.value='0';wear.title='刮痕磨损 0–1';row.append(input,wear);$('stickerfields').append(row)}
  await loadGroups();await health();
  const item=catalog.find(x=>x.def===7&&x.paint===44)||catalog[0];kind=item.kind;
  renderGroups(item.def);pick(item);setInterval(health,2500);
}catch(e){notice(e.message,'error')}}boot();
