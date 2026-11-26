// Lifecycle options are a closed command-specific schema, not an argv search.
export function parseLifecycleOptions(command,args){
 const commands=['validate','build','migrate','start','status','stop','destroy','recover-operation-lock'];
 const refuse=()=>{throw Error('Invalid lifecycle options');};
 if(!commands.includes(command))refuse();
 const allowed=new Map([['--project','project'],['--config-file','env']]);
 if(command==='destroy')allowed.set('--confirm-destroy','confirmation');
 if(command==='recover-operation-lock')allowed.set('--confirm-recover-lock','confirmation');
 if(command==='build')allowed.set('--allow-dirty','allowDirty');
 const result={};
 for(let i=0;i<args.length;i++){
  const key=allowed.get(args[i]);if(!key||Object.hasOwn(result,key))refuse();
  if(key==='allowDirty'){result[key]=true;continue;}
  const value=args[++i];if(!value||value.startsWith('-'))refuse();result[key]=value;
 }
 const projectPattern=command==='recover-operation-lock'?/^nexus_(prod|s8|s10_restore)_[a-z0-9_]+$/:/^nexus_(prod|s8)_[a-z0-9_]+$/;
 if(!projectPattern.test(result.project??'')||!result.env)refuse();
 if(['destroy','recover-operation-lock'].includes(command)&&result.confirmation!==result.project)refuse();
 return result;
}
