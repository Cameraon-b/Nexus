import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const application='909cadc9edf6ff8484b8859b0f17ac9b0184a1c0';
const candidate='f785ae72cda0e1333194eff69c63022379920287acd402b77b93c0ecc86c440d';
function assertAcceptedOperationalBoundary(doc){
 const plain=doc.replaceAll('**','').replaceAll('`','');
 assert.match(plain,/Round[ -]14 technical\/live acceptance is complete/);
 assert.match(plain,/single bounded final review passed with zero closure blockers/);
 assert.match(plain,new RegExp(`candidate ${candidate} (?:verified/)?installed on Reeba(?: and |/)Nora`));
 assert.match(plain,/successful backup(?: and off-host pull, and a successful disposable restore with exact teardown|\/pull\/restore and verified exact teardown)/);
 assert.match(plain,/uncommitted (?:Sprint 10 operational tree|operational tree)/);
 assert.match(plain,/not (?:a new production application image or Git release|an application upgrade)/);
 assert.match(plain,/Cameron acceptance and Git integration remain pending/);
 assert.match(plain,/no Sprint 10 commit, merge or push(?: has occurred)?, and GitHub remains untouched/);
 assert.doesNotMatch(plain,/rebuilt candidate\/live restore remain pending|not yet built into a final candidate, installed, migrated, or re-rehearsed live|Sprint-10 Round-14 corrections.*no claim of live installation or acceptance/);
}
test('root README separates deployed Sprint-8 application, accepted Round-14 operations and pending Git integration',()=>{
 const doc=read('README.md');
 for(const term of ['909cadc9edf6ff8484b8859b0f17ac9b0184a1c0','nexus_prod_nora','https://nexus.aether.lab','Sprint 9','Sprint 10','AETHER private-CA','HSTS for Nexus only','signed age-encrypted backups','off-host retention','disposable restore proof','six-layer monitoring','Sprint 7 schema and Review workflow exist in the real local workspace','real local agent integration exists','established reviewed workflow','disposable tests never target the real database','/demo']) assert.ok(doc.includes(term),term);
 assertAcceptedOperationalBoundary(doc);
 assert.match(doc.replaceAll('`',''),new RegExp(`accepted Sprint-8 production application image/commit remains ${application}, deployed on Nora as nexus_prod_nora`));
 assert.doesNotMatch(doc,/awaiting independent review|not an approved release or Nora deployment|Sprint 7 migration has not been applied|no Hermes\/OpenClaw installation|No real DNS, certificates/);
 assert.doesNotMatch(doc.match(/\*\*Still to build:\*\*[^\n]*/)?.[0]??'',/deployment on Nora/);
});
test('backend README preserves applied Sprint-7 history and current operational boundaries',()=>{
 const doc=read('backend/README.md');
 const plain=doc.replaceAll('**','').replaceAll('`','');
 for(const phrase of ['migration has not been applied','unapplied ApprovalGovernance','Sprint 7 real-data migration is reserved','Do not restart the API against the real']) assert.ok(!plain.toLowerCase().includes(phrase.toLowerCase()),phrase);
 assert.match(plain,/ApprovalGovernance.*reviewed, backed up, and applied to the real local nexus database/);
 assert.match(plain,/migration history advanced from 10 to 11/);
 assert.match(plain,/protected data was preserved/);
 assert.ok(doc.includes('../docs/Sprint_7_Approval_Governance.md#migration-and-real-data-preservation'));
 assert.match(plain,/Normal development startup uses checked-in migrations.*established reviewed local workflow/);
 assert.match(plain,/Production migrations remain explicit and backup-gated/);
 assert.match(plain,/disposable tests must never target (?:the )?real nexus/);
 assertAcceptedOperationalBoundary(doc);
 assert.match(plain,new RegExp(`production images remain ${application}`));
 assert.match(plain,/protected Reeba DB counts unchanged/);
 assert.match(plain,/Up adds schema without updating existing drafts/);
 assert.match(plain,/Down drops governance guards\/decisions/);
 assert.match(plain,/Downgrade intentionally loses governance history; take a backup/);
});
test('authoritative operations docs retain historical Round-8 review and pre-live boundary',()=>{
 for(const file of ['deployment/README.md','docs/Sprint_10_Production_Trust_Recovery.md']){
  const doc=read(file);
  assert.ok(doc.includes('Round-8 independent review passed all three specialist gates'),file);
  assert.ok(doc.includes('no final candidate, live migration, or new restore has occurred'),file);
  assert.doesNotMatch(doc,/No (?:later )?fresh independent review has yet passed|^#Round 8 RED/m);
 }
});
