import {exactKeys,fail} from './production-recovery.mjs';
export const aggregateTables={accounts:'Accounts',participants:'Participants',conversations:'Conversations',messages:'Messages',sessions:'Sessions',integrationTokens:'IntegrationTokens',messageDrafts:'MessageDrafts',approvalDecisions:'ApprovalDecisions',memberships:'Memberships',inboxCursors:'InboxCursors',migrations:'__EFMigrationsHistory'};
// One statement, one PostgreSQL MVCC snapshot, scalar JSON only; never select row data.
export const aggregateSql='SELECT json_build_object('+Object.entries(aggregateTables).map(([key,table])=>`'${key}', (SELECT count(*) FROM "${table}")`).join(', ')+')::text;';
export function validateAggregates(value){
 exactKeys(value,Object.keys(aggregateTables));
 if(Object.values(value).some(n=>!Number.isSafeInteger(n)||n<0)||value.migrations<1)fail();
 return Object.fromEntries(Object.keys(aggregateTables).map(k=>[k,value[k]]));
}
export function parseAggregates(bytes){try{return validateAggregates(JSON.parse(bytes.toString().trim()));}catch{fail();}}
export const sameAggregates=(a,b)=>JSON.stringify(validateAggregates(a))===JSON.stringify(validateAggregates(b));
export const psqlArgs=(id,sql)=>['exec',id,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-U','nexus','-d','nexus','-c',sql];
