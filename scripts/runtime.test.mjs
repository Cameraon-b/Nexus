import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ensureRuntime} from './runtime.mjs';
import viteConfig from '../vite.config.ts';
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

test('Vite ignores project-local runtime and tool directories while watching', async()=>{
 const resolved=typeof viteConfig==='function'?await viteConfig({command:'serve',mode:'test',isSsrBuild:false,isPreview:false}):viteConfig;
 const ignored=resolved.server?.watch?.ignored;
 assert.ok(Array.isArray(ignored),'server.watch.ignored must be configured');
 for(const directory of ['.cache','.local','.tools','.browsers','backend'])
  assert.ok(ignored.some(pattern=>String(pattern).includes(directory)),`${directory} must be ignored by the Vite watcher`);
});
