import fs from 'node:fs';
import path from 'node:path';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const maxBytes=4*1024*1024;

// Only catalog-owned public PNGs can be fetched; callers cannot supply a remote URL.
export function createPreviewCache(catalog,directory){
  fs.mkdirSync(directory,{recursive:true});
  const sources=new Map(catalog.map(item=>[`${item.def}-${item.paint}`,item.image]));
  const pending=new Map(),failed=new Map(),waiting=[];
  let active=0;
  const runNext=()=>{
    while(active<4&&waiting.length){const {run,resolve,reject}=waiting.shift();active++;Promise.resolve().then(run).then(resolve,reject).finally(()=>{active--;runNext()})}
  };
  const limited=run=>new Promise((resolve,reject)=>{waiting.push({run,resolve,reject});runNext()});
  async function download(key,file){
    const url=new URL(sources.get(key));
    if(url.protocol!=='https:'||url.host!=='raw.githubusercontent.com'||!/^\/Nereziel\/cs2-WeaponPaints\/main\/website\/img\/skins\/[a-zA-Z0-9_-]+\.png$/.test(url.pathname)||url.search)throw new Error('Invalid preview source');
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'image/png'}});
    if(!response.ok){const e=new Error(`Preview HTTP ${response.status}`);e.status=response.status===404?404:502;throw e}
    if(!response.headers.get('content-type')?.startsWith('image/png'))throw new Error('Preview is not a PNG');
    if(Number(response.headers.get('content-length'))>maxBytes){await response.body.cancel();throw new Error('Preview exceeds size limit')}
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw new Error('Preview exceeds size limit');chunks.push(Buffer.from(chunk))}
    const image=Buffer.concat(chunks);
    if(image.length<24||!image.subarray(0,8).equals(signature)||image.toString('ascii',12,16)!=='IHDR')throw new Error('Invalid PNG image');
    if(image.readUInt32BE(16)>8192||image.readUInt32BE(20)>8192)throw new Error('Preview dimensions exceed limit');
    const temporary=`${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary,image);
    await fs.promises.rename(temporary,file);
    failed.delete(key);return {file,size:image.length,width:image.readUInt32BE(16),height:image.readUInt32BE(20),cached:false};
  }
  async function get(def,paint,{retry=false}={}){
    const key=`${def}-${paint}`;
    if(!sources.has(key)){const e=new Error('Unknown preview');e.status=404;throw e}
    const file=path.join(directory,`${key}.png`);
    try{const stat=await fs.promises.stat(file);if(stat.size>=24)return {file,size:stat.size,cached:true}}catch{}
    if(pending.has(key))return pending.get(key);
    const previous=failed.get(key);
    if(!retry&&previous&&Date.now()<previous.until){const e=new Error(previous.message);e.status=previous.status;throw e}
    const request=limited(()=>download(key,file)).catch(e=>{failed.set(key,{until:Date.now()+(e.status===404?3600000:30000),message:e.message,status:e.status||502});throw e}).finally(()=>pending.delete(key));
    pending.set(key,request);return request;
  }
  return {get};
}
