import dgram from 'node:dgram';import os from 'node:os';
function query(bind,target){return new Promise(resolve=>{const s=dgram.createSocket('udp4');let done=false;const finish=result=>{if(done)return;done=true;s.close();resolve(result)};const timer=setTimeout(()=>finish('no-response'),1600);s.on('error',e=>{clearTimeout(timer);finish(e.code)});s.on('message',m=>{clearTimeout(timer);finish(m.length>4?'response':'invalid')});s.bind(0,bind,()=>s.send(Buffer.concat([Buffer.from([255,255,255,255,84]),Buffer.from('Source Engine Query\0')]),27015,target));})}
const local=await query('127.0.0.1','127.0.0.1');
const adapters=Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal);
const external=[];for(const a of adapters)external.push(await query(a.address,a.address));
console.log(JSON.stringify({loopback:local,sameHostAdapterQueries:external,externalIsolation:'not tested from another device; same-host traffic cannot validate inbound firewall blocking'}));
if(local!=='response')process.exitCode=1;
