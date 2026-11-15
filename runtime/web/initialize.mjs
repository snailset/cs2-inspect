import {secretsPath} from './paths.mjs';
import fs from 'node:fs';import mysql from 'mysql2/promise';
const s=JSON.parse(fs.readFileSync(secretsPath,'utf8').replace(/^\uFEFF/,''));
const c=await mysql.createConnection({...s.database,multipleStatements:true});
await c.query(fs.readFileSync(new URL('schema.sql',import.meta.url),'utf8'));
const [rows]=await c.query('SHOW TABLES');console.log(`Database schema ready: ${rows.length} tables`);await c.end();
