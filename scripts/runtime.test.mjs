import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ensureRuntime} from './runtime.mjs';
mkdirSync('.cache/runtime-tests',{recursive:true});
test('never rotates credentials when database data already exists',()=>{
 const root=mkdtempSync(path.resolve('.cache/runtime-tests','existing-'));
 mkdirSync(path.join(root,'.local/postgres'),{recursive:true});
 writeFileSync(path.join(root,'.local/postgres','PG_VERSION'),'18');
 assert.throws(()=>ensureRuntime(root),/restore.*runtime.json/i);
});

test('generates private local database configuration once and reuses it',()=>{
 const root=mkdtempSync(path.resolve('.cache/runtime-tests','config-'));
 const first=ensureRuntime(root); const again=ensureRuntime(root);
 assert.deepEqual(again,first);
 assert.match(first.postgresPassword,/^[a-f0-9]{64}$/);
 assert.match(first.connectionString,/Database=nexus;/);
 assert.match(first.adminConnectionString,/Database=postgres;/);
 assert.equal(JSON.parse(readFileSync(path.join(root,'.local/runtime.json'),'utf8')).postgresPassword,first.postgresPassword);
});
