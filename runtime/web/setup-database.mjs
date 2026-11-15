import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import {base,settings,secretsPath,readJSON} from './paths.mjs';
const dbHome=path.join(base,'tools/mariadb-11.4.13-winx64');
const data=path.join(base,'data/mariadb');
const ini=path.join(base,'data/mariadb.ini');
const unix=p=>p.replaceAll('\\','/');
const env={...process.env,TEMP:settings.tempRoot,TMP:settings.tempRoot};
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(settings.tempRoot,{recursive:true});
fs.writeFileSync(ini,`[mariadbd]\nbasedir="${unix(dbHome)}"\ndatadir="${unix(data)}"\nbind-address=127.0.0.1\nport=3307\nskip-name-resolve\ninnodb-buffer-pool-size=64M\nmax-connections=20\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\nlog-error="${unix(path.join(base,'logs/mariadb-error.log'))}"\ntmpdir="${unix(settings.tempRoot)}"\n`);
if(!fs.existsSync(path.join(data,'mysql'))){
  const init=spawnSync(path.join(dbHome,'bin/mariadb-install-db.exe'),[`--datadir=${data}`,'--port=3307'],{env,windowsHide:true,encoding:'utf8'});
  fs.writeFileSync(path.join(base,'logs/database-init.log'),(init.stdout||'')+(init.stderr||''));
  if(init.error||init.status!==0)throw new Error('mariadb-install-db failed; see logs/database-init.log');
}
const random=()=>crypto.randomBytes(24).toString('hex');
if(!fs.existsSync(secretsPath))fs.writeFileSync(secretsPath,JSON.stringify({database:{host:'127.0.0.1',port:3307,user:'inspect',password:random(),database:'cs2inspect'},rootPassword:random(),rconPassword:random(),webToken:random()},null,2));
const secrets=readJSON(secretsPath);
const log=fs.openSync(path.join(base,'logs/database-setup.log'),'a');
const child=spawn(path.join(dbHome,'bin/mariadbd.exe'),[`--defaults-file=${ini}`],{cwd:dbHome,env,windowsHide:true,stdio:['ignore',log,log]});
let spawnError;child.once('error',e=>spawnError=e);
let root;
try{
  for(let i=0;i<60&&!root;i++){
    if(spawnError||child.exitCode!==null)throw new Error('MariaDB exited during setup; see logs/database-setup.log');
    for(const password of [secrets.rootPassword,'']){
      try{root=await mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password,connectTimeout:1000,multipleStatements:true});break}catch{}
    }
    if(!root)await new Promise(r=>setTimeout(r,500));
  }
  if(!root)throw new Error('Could not connect to new MariaDB instance. See logs.');
  await root.query("CREATE DATABASE IF NOT EXISTS cs2inspect CHARACTER SET utf8mb4");
  await root.query("CREATE USER IF NOT EXISTS 'inspect'@'127.0.0.1' IDENTIFIED BY ?",[secrets.database.password]);
  await root.query("ALTER USER 'inspect'@'127.0.0.1' IDENTIFIED BY ?",[secrets.database.password]);
  await root.query("GRANT ALL PRIVILEGES ON cs2inspect.* TO 'inspect'@'127.0.0.1'");
  await root.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?",[secrets.rootPassword]);
  const connection=await mysql.createConnection({...secrets.database,multipleStatements:true});
  try{await connection.query(fs.readFileSync(new URL('schema.sql',import.meta.url),'utf8'))}finally{await connection.end()}
  await root.query('SHUTDOWN');
  console.log('Database schema and fresh credentials created; setup database stopped.');
}finally{
  if(root)try{await root.end()}catch{}
  if(child.exitCode===null){await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve()},3000);child.once('exit',()=>{clearTimeout(timer);resolve()})})}
  fs.closeSync(log);
}
