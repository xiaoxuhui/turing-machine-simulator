import {expect,it} from 'vitest';
import {campaignMigrationConflict,normalizeCampaignDraft,normalizeCampaignProgress} from '../src/campaign';
import {encodeCampaignBackup,parseCampaignBackup} from '../src/campaign-backup';
it('retains the exact saved draft and rejects an unsafe blank-symbol merge',()=>{
 const raw='q0,_->q1,_,R\nq1,□->HALT,1,N';
 const progress=normalizeCampaignProgress({version:1,completedLevelIds:['write-one'],drafts:{'write-one':raw}});
 expect(progress.drafts['write-one']).toBe(raw);
 expect(normalizeCampaignDraft('write-one',raw)).toBe(raw);
 expect(campaignMigrationConflict('write-one',raw)).toMatch(/原草稿已保留/);
 expect(parseCampaignBackup(encodeCampaignBackup(progress)).drafts['write-one']).toBe(raw);
});
it('blocks a collision between an old terminal and an existing state',()=>{
 expect(campaignMigrationConflict('write-one','q0,□->HALT,1,N\nH,1->q0,1,R')).toMatch(/原草稿已保留/);
});
it('keeps a nonconflicting unfinished draft byte-for-byte',()=>{
 const raw='q0,□ -> HALT,1,N\r\n# 未完成\r\nq1,1 ->';
 expect(normalizeCampaignProgress({version:1,completedLevelIds:[],drafts:{'write-one':raw}}).drafts['write-one']).toBe(raw);
});
it('does not confuse the R movement direction with an old reject state',()=>{
 expect(campaignMigrationConflict('write-one','q0,1->F,1,R')).toBeNull();
});
