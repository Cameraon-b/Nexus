import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const reviewedTarget='909cadc9edf6ff8484b8859b0f17ac9b0184a1c0';
const tag=process.env.NEXUS_COMMIT;
if(tag!==reviewedTarget)throw Error(`Image probes require explicit NEXUS_COMMIT=${reviewedTarget}; review target changes before updating this gate.`);
function docker(args){return spawnSync('docker',args,{encoding:'utf8',timeout:30000});}
test('missing mounted database secret fails concisely without diagnostics',()=>{
 const r=docker(['run','--rm','--pull','never','--network','none','-e','Nexus__DatabasePasswordFile=/run/secrets/missing',`nexus-api:${tag}`,'--migrate-only']);
 assert.equal(r.status,1);
 assert.equal((r.stdout+r.stderr).trim(),'Database secret is missing or invalid.');
});
test('runtime health probe is bounded, quiet and independent of configuration',()=>{
 const r=docker(['run','--rm','--pull','never','--network','none',`nexus-api:${tag}`,'--healthcheck']);
 assert.equal(r.status,1);assert.equal((r.stdout+r.stderr).trim(),'');
});
test('runtime images are non-root and omit SDK/source/secrets',()=>{
 for(const [image,command] of [[`nexus-api:${tag}`,'test ! -d /usr/share/dotnet/sdk && test ! -e /app/appsettings.Development.json && test ! -e /src && test ! -e /app/Nexus.Tests.dll && test -z "$(find /app -name \'*.cs\' -o -name \'*.csproj\' -o -name \'*.pem\' -o -name \'*.key\')" && for p in .git .local .tools .cache .browsers tests node_modules; do test ! -e /app/$p; done'],[`nexus-frontend:${tag}`,'test ! -e /src && test ! -e /usr/share/nginx/html/src && test ! -e /usr/share/nginx/html/node_modules && test -f /usr/share/nginx/html/index.html && test -z "$(find /usr/share/nginx/html -name \"*.map\" -o -name \"*.tsx\" -o -name \"*.ts\" -o -name \"package*.json\")" && for p in .git .local .tools .cache .browsers tests; do test ! -e /usr/share/nginx/html/$p; done']]){
  const label=docker(['image','inspect','--format','{{index .Config.Labels "org.opencontainers.image.revision"}}',image]);assert.equal(label.stdout.trim(),tag);
  const i=docker(['image','inspect','--format','{{.Config.User}}',image]);assert.equal(i.status,0);assert.ok(!['','root','0'].includes(i.stdout.trim()));
  const r=docker(['run','--rm','--pull','never','--network','none','--entrypoint','/bin/sh',image,'-ec',command]);assert.equal(r.status,0,r.stderr);
 }
});
