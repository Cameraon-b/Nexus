// Preserve the operation's recovery priority even when release also fails.
export function finishOperation(primary,release){
 const finish=cleanup=>{
  if(primary&&cleanup)throw new AggregateError([primary,cleanup],'Operation and cleanup failed');
  if(primary||cleanup)throw primary||cleanup;
 };
 let result;try{result=release?.();}catch(error){return finish(error);}
 // Retain synchronous Windows/test callers, while awaiting resident POSIX release.
 if(result&&typeof result.then==='function')return result.then(()=>finish(),finish);
 return finish();
}
export function operationFailureLines(error){
 if(error instanceof AggregateError)return error.errors.flatMap(operationFailureLines);
 switch(error?.code){
 case 'NEXUS_OPERATION_LOCK_CLEANUP':return ['NEXUS_OPERATION_LOCK_CLEANUP: operation lock cleanup unverified. Suspend scheduling and inspect private recovery state before retrying.'];
 case 'NEXUS_OPERATION_LOCKED':return ['Production operation refused: operation lock is held. Do not steal stale locks; follow deployment/README.md recovery verification.'];
 case 'NEXUS_RECOVERY_CLEANUP':return ['Sensitive cleanup could not be verified. Suspend recovery scheduling and inspect private recovery state before retrying.'];
 case 'NEXUS_PUBLICATION_CLEANUP':return ['NEXUS_PUBLICATION_CLEANUP: published evidence preserved. Suspend recovery scheduling; privately inspect the exact public quartet and exact-run staging before any recovery/removal.'];
 case 'NEXUS_RESTORE_CLEANUP':return ['NEXUS_RESTORE_CLEANUP: disposable restore cleanup unverified. Keep recovery material; prove exact-project resource absence before removing private staging or retrying.'];
 case 'NEXUS_BACKUP_AVAILABILITY':return ['NEXUS_BACKUP_AVAILABILITY: backup refused; exact application restart/health unverified. Recover availability using the reviewed exact-project procedure. No artifact accepted.'+(error.cleanupUnverified?' Private staging cleanup also unverified; private recovery inspection required.':'')];
 default:return ['Production operation refused: invalid arguments/configuration, missing secret, or failed Docker operation. No credentials displayed.'];
 }
}
