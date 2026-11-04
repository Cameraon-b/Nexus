import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
export function ensureRuntime(root) {
 const directory=path.join(root,'.local'), file=path.join(directory,'runtime.json');
 if(existsSync(file)) return JSON.parse(readFileSync(file,'utf8'));
 const data=path.join(directory,'postgres');
 if(existsSync(data)&&readdirSync(data).length) throw new Error('Database data exists. Restore .local/runtime.json from your backup; credentials will not be regenerated.');
 mkdirSync(directory,{recursive:true});
 const postgresPassword=randomBytes(32).toString('hex');
 const connection=(db)=>`Host=127.0.0.1;Port=55432;Database=${db};Username=nexus;Password=${postgresPassword};Include Error Detail=false`;
 const config={postgresPassword,connectionString:connection('nexus'),adminConnectionString:connection('postgres')};
 writeFileSync(file,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
 return config;
}
