import {createApi} from './api-client.js';
const $=id=>document.getElementById(id),api=createApi();
let catalog=[],stickers=[],kind='weapon',selected,presets=[],saved=[],busy=false,healthPending=false,skinRequestBusy=false,lastListKey='',previewVersion=0;
const notice=(text,type='')=>{$('notice').textContent=text;$('notice').className=type};
const blank={seed:0,wear:0.01,nametag:'',stattrak:false,stattrakCount:0,stickers:[]};
function values(){
  if(!selected)throw new Error('请先选择饰品');
  return {def:selected.def,paint:selected.paint,seed:Number($('seed').value),wear:Number($('wear').value),nametag:selected.kind==='glove'?'':$('nametag').value,stattrak:selected.kind==='glove'?false:$('stattrak').checked,stattrakCount:Number($('stattrakCount').value),stickers:Array.from({length:5},(_,i)=>({id:selected.kind==='weapon'?Number($(`sticker${i}`).value.split(' · ')[0]||0):0,wear:Number($(`scrape${i}`).value||0)}))};
}
function keepDraft(){try{localStorage.setItem('cs2inspect.editor.v2',JSON.stringify(values()))}catch{}}
function showPreview(item,retry=false){
  const version=++previewVersion,previous=$('previewimage');
  const image=document.createElement('img');image.id='previewimage';image.alt=item.name;image.decoding='async';image.fetchPriority='high';image.hidden=true;
  previous.replaceWith(image);$('monogram').textContent=item.group;$('monogram').hidden=false;$('previewstatus').textContent='正在加载图片…';$('previewretry').hidden=true;$('previewbox').classList.add('loading');
  image.onload=()=>{if(version!==previewVersion)return;image.hidden=false;$('monogram').hidden=true;$('previewstatus').textContent='';$('previewbox').classList.remove('loading')};
  image.onerror=()=>{if(version!==previewVersion)return;image.hidden=true;$('previewstatus').textContent='图片暂时无法加载';$('previewretry').hidden=false;$('previewbox').classList.remove('loading')};
  image.src=item.preview+(retry?'?retry=1':'');
}
function pick(item,v){
  selected=item;const match=saved.find(x=>x.def===item.def&&x.paint===item.paint),input={...blank,...(v||match||{})};if(!v&&match)input.wear=Number(Number(match.wear).toPrecision(7));
  $('selected').textContent=item.name;$('itemmeta').textContent=`${item.group} · 皮肤编号 ${item.paint}`;
  showPreview(item);
  $('stickersection').hidden=item.kind!=='weapon';$('weaponextras').hidden=item.kind==='glove';
  for(const k of ['seed','wear','nametag','stattrakCount'])$(k).value=input[k];
  $('stattrak').checked=!!input.stattrak;$('wearslider').value=input.wear;
  for(let i=0;i<5;i++){const s=input.stickers?.[i]||{id:0,wear:0};const match=stickers.find(x=>x.id===s.id);$(`sticker${i}`).value=match?`${match.id} · ${match.name}`:'';$(`scrape${i}`).value=s.wear||0}
  renderItems();keepDraft();
}
function renderGroups(preferred){
  $('selectors').hidden=kind==='presets';$('categorylabel').textContent=kind==='glove'?'1 · 选择手套类型':kind==='knife'?'1 · 选择刀具类型':'1 · 选择枪械';
  const groups=new Map;for(const item of catalog.filter(x=>x.kind===kind)){if(!groups.has(item.def))groups.set(item.def,{label:item.group,count:0});groups.get(item.def).count++}
  $('category').replaceChildren(...[...groups].map(([def,g])=>new Option(`${g.label} · ${g.count} 款`,def)));if(groups.has(Number(preferred)))$('category').value=String(preferred);
}
function renderItems(){
  const def=Number($('category').value),query=$('search').value.trim().toLowerCase();
  const key=`${kind}|${def}|${query}|${kind==='presets'?presets.map(p=>p.date).join(','):''}`;
  const mark=()=>{for(const button of $('items').querySelectorAll('button.item')){const chosen=button.dataset.item===`${selected?.def}:${selected?.paint}`;button.classList.toggle('chosen',chosen);button.setAttribute('aria-pressed',String(chosen))}};
  if(key===lastListKey){mark();return}lastListKey=key;
  const list=kind==='presets'?presets.map(v=>({...catalog.find(x=>x.def===v.def&&x.paint===v.paint),preset:v})).filter(x=>x.name):catalog.filter(x=>x.kind===kind&&x.def===def);
  const found=list.filter(x=>kind==='presets'||`${x.name} ${x.paint}`.toLowerCase().includes(query));
  $('count').textContent=`${found.length} 款`;$('groupname').textContent=list[0]?.group||'';$('items').replaceChildren();
  if(!found.length){const p=document.createElement('p');p.className='empty';p.textContent=kind==='presets'?'保存喜欢的搭配后，会出现在这里。':'当前大类中没有匹配的皮肤。';$('items').append(p)}
  for(const item of found){
    const b=document.createElement('button');b.className='item';b.dataset.item=`${item.def}:${item.paint}`;
    const thumb=document.createElement('span');thumb.className='thumbnail loading';const fallback=document.createElement('span');fallback.className='thumbfallback';fallback.textContent='预览';
    const image=document.createElement('img');image.alt='';image.loading='lazy';image.decoding='async';image.width=88;image.height=64;
    image.onload=()=>{thumb.classList.remove('loading');fallback.hidden=true};image.onerror=()=>{thumb.classList.remove('loading');image.hidden=true;fallback.textContent='暂无图片'};image.src=item.preview;
    thumb.append(fallback,image);const text=document.createElement('span');text.className='itemtext';const name=document.createElement('span');name.className='itemname';name.textContent=item.preset?.title||item.skinName;const meta=document.createElement('span');meta.className='sub';meta.textContent=item.preset?`模板 ${item.preset.seed} · ${item.group}`:`${item.group} · #${item.paint}`;text.append(name,meta);b.append(thumb,text);b.onclick=()=>pick(item,item.preset);$('items').append(b);
  }
  mark();
}
async function health(){
  if(healthPending)return;healthPending=true;
  try{
    const s=await api('/api/state');saved=s.saved;busy=s.operation.running;
    $('health').textContent=s.connected?'● 已连接本机检视服':s.server?'● 检视服务已启动':'○ 检视服务未启动';$('health').className='status'+(s.server?' ok':'');
    $('servicehint').textContent=s.connected?'选择饰品后直接应用；按 F 检视，按 R 换弹。':s.server?'等待客户端连接。如游戏已打开，可复制连接指令进入地图。':'点击“启动检视”，自动启动服务并以检视模式打开 CS2。';
    $('start').disabled=busy;$('stop').disabled=busy||(!s.server&&!s.database);$('apply').disabled=busy||skinRequestBusy||!s.database;$('refresh').disabled=busy||skinRequestBusy||!s.server;
    $('controlnotice').textContent=s.operation.message||'';$('controlnotice').className=s.operation.error?'error':'';return s;
  }catch{$('health').textContent='○ 控制台后台未连接';$('servicehint').textContent='请重新打开部署目录中的“打开检视控制台.cmd”。';$('start').disabled=true;$('stop').disabled=true;$('apply').disabled=true}
  finally{healthPending=false}
}
$('tabs').onclick=async e=>{
  const next=e.target.dataset.kind;if(!next)return;kind=next;$('search').value='';
  try{if(kind==='presets')presets=await api('/api/presets');for(const b of $('tabs').children)b.classList.toggle('active',b.dataset.kind===kind);renderGroups(selected?.kind===kind?selected.def:undefined);if(kind!=='presets'){const item=catalog.find(x=>x.kind===kind&&x.def===Number($('category').value)&&(x.def===selected?.def?x.paint===selected.paint:true))||catalog.find(x=>x.kind===kind&&x.def===Number($('category').value));if(item)pick(item)}renderItems()}catch(e){notice(e.message,'error')}
};
$('category').onchange=()=>{$('search').value='';pick(catalog.find(x=>x.kind===kind&&x.def===Number($('category').value)));$('items').scrollTop=0};$('search').oninput=renderItems;
$('wearslider').oninput=()=>{$('wear').value=$('wearslider').value;keepDraft()};$('wear').oninput=()=>$('wearslider').value=$('wear').value;$('form').oninput=keepDraft;
$('form').onsubmit=async e=>{e.preventDefault();if(skinRequestBusy||busy)return;skinRequestBusy=true;$('apply').disabled=true;$('refresh').disabled=true;notice('正在应用饰品…');try{const r=await api('/api/apply',values());notice(r.notice,r.refreshed?'success':'');keepDraft()}catch(e){notice(e.message,'error')}finally{skinRequestBusy=false;await health()}};
$('save').onclick=async()=>{try{const v=values();await api('/api/presets',{...v,title:`${selected.name} · 模板 ${v.seed} · ${v.wear}`});notice('已保存到“我的搭配”。','success');if(kind==='presets'){presets=await api('/api/presets');renderItems()}}catch(e){notice(e.message,'error')}};
$('refresh').onclick=async()=>{if(skinRequestBusy||busy)return;skinRequestBusy=true;$('apply').disabled=true;$('refresh').disabled=true;try{const r=await api('/api/refresh',{});notice(r.notice,r.refreshed?'success':'')}catch(e){notice(e.message,'error')}finally{skinRequestBusy=false;await health()}};
async function control(action){if(busy)return;busy=true;$('start').disabled=true;$('stop').disabled=true;$('controlnotice').textContent=action==='start'?'正在启动，请稍候…':'正在停止检视服务…';try{await api(`/api/control/${action}`,{});await health()}catch(e){busy=false;$('controlnotice').textContent=e.message;$('controlnotice').className='error';await health()}}
$('start').onclick=()=>control('start');$('stop').onclick=()=>control('stop');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText('connect 127.0.0.1:27015');$('copy').textContent='已复制';setTimeout(()=>$('copy').textContent='复制连接指令',1800)}catch{notice('请手动复制页面上的连接指令')}};
$('previewretry').onclick=()=>{if(selected)showPreview(selected,true)};
async function boot(){try{
  const b=await api('/api/bootstrap');catalog=b.catalog;stickers=b.stickers;
  const frag=document.createDocumentFragment();for(const s of stickers){const o=document.createElement('option');o.value=`${s.id} · ${s.name}`;frag.append(o)}$('stickernames').append(frag);
  for(let i=0;i<5;i++){const row=document.createElement('div');row.className='stickerrow';const input=document.createElement('input');input.id=`sticker${i}`;input.setAttribute('list','stickernames');input.placeholder=`贴纸 ${i+1}：名称或编号`;input.setAttribute('aria-label',`贴纸 ${i+1}`);const wear=document.createElement('input');wear.id=`scrape${i}`;wear.type='number';wear.min='0';wear.max='1';wear.step='any';wear.value='0';wear.title='刮痕磨损 0–1';row.append(input,wear);$('stickerfields').append(row)}
  await health();let draft;try{draft=JSON.parse(localStorage.getItem('cs2inspect.editor.v2'))}catch{}
  const item=catalog.find(x=>x.def===draft?.def&&x.paint===draft?.paint)||catalog.find(x=>x.def===7&&x.paint===44)||catalog[0];kind=item.kind;for(const b of $('tabs').children)b.classList.toggle('active',b.dataset.kind===kind);
  renderGroups(item.def);pick(item,draft?.def===item.def&&draft?.paint===item.paint?draft:undefined);setInterval(health,2500);
}catch(e){notice(e.message,'error')}}boot();
