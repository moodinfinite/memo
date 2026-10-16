import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,cards,Storage} from './helpers.mjs';
const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const record=(id,overrides={})=>({card_id:id,set_id:'deck',repetitions:1,interval:1,easiness:2.6,next_review:'2026-10-17',last_seen_at:'2026-10-16T04:00:00Z',...overrides});

test('Learn saves each answer immediately and grants review credit after recall, once per day',async()=>{
 const clock={now:'2026-10-16T05:00:00Z'},h=harness(new Storage(),clock);h.db.error={message:'offline'};
 h.study.getState().startLearnSession(cards.slice(0,1),'deck');
 h.study.getState().answerLearnCard(true);
 assert.equal(h.srs.getState().cardSRS[cards[0].id],undefined);
 const draft=await h.study.getState().loadProgress('deck');assert.equal(draft.state.learnScores[cards[0].id],1);
 const next=harness(h.storage,clock);next.db.error={message:'offline'};next.study.getState().resumeSession(draft,cards);
 next.study.getState().answerLearnCard(true);
 assert.equal(next.srs.getState().cardSRS[cards[0].id].repetitions,1);
 assert.equal(next.study.getState().learnStoryReady,true);
 next.study.getState().completeLearnStory();assert.equal(next.study.getState().isComplete,true);
 next.study.getState().startLearnSession(cards.slice(0,1),'deck');
 next.study.getState().answerLearnCard(true);next.study.getState().answerLearnCard(true);
 assert.equal(next.srs.getState().cardSRS[cards[0].id].repetitions,1);
});

test('wrong last card remains retryable, stale answers and premature transitions do nothing',()=>{
 const h=harness();h.study.getState().startLearnSession(cards.slice(0,1),'deck');
 const original=h.study.getState();h.study.getState().advanceToNextBatch();h.study.getState().completeLearnStory();
 assert.equal(h.study.getState().learnBatch.length,1);assert.equal(h.study.getState().isComplete,false);
 const token={sessionId:original.sessionId,turn:original.learnTurn};h.study.getState().answerLearnCard(false,token);
 assert.equal(h.study.getState().learnTurn,1);assert.equal(h.study.getState().learnScores[cards[0].id],0);
 h.study.getState().answerLearnCard(true,token);assert.equal(h.study.getState().learnTurn,1);
 h.study.getState().answerLearnCard(true);h.study.getState().answerLearnCard(true);
 assert.equal(h.study.getState().learnGraduated.length,1);
 h.study.getState().answerLearnCard(true);assert.equal(h.study.getState().learnGraduated.length,1);
 h.study.getState().startLearnSession(cards.slice(0,1),'deck');h.study.getState().answerLearnCard(true,token);
 assert.equal(h.study.getState().learnTurn,0);
});

test('Learn resumes at the same surviving card and recovers legacy drafts without auto-completing',async()=>{
 const h=harness();h.study.getState().startLearnSession(cards,'deck');
 const draft=await h.study.getState().loadProgress('deck');draft.state.learnBatchIdx=2;
 const removed=draft.state.learnBatch[0],current=draft.state.learnBatch[2];
 h.study.getState().resumeSession(draft,cards.filter(c=>c.id!==removed));
 assert.equal(h.study.getState().learnBatch[h.study.getState().learnBatchIdx].id,current);
 h.study.getState().resumeSession({...draft,state:{}},cards);
 assert.equal(h.study.getState().learnBatch.length,5);assert.equal(h.study.getState().learnQueue.length,5);
 assert.equal(h.study.getState().learnStoryReady,false);h.study.getState().completeLearnStory();assert.equal(h.study.getState().isComplete,false);
});

test('Learn survives interlude reloads and graduates every card exactly once across batches',async()=>{
 const h=harness();h.study.getState().startLearnSession(cards,'deck');
 while(!h.study.getState().learnStoryReady)h.study.getState().answerLearnCard(true);
 const draft=await h.study.getState().loadProgress('deck');h.study.getState().resumeSession(draft,cards);
 assert.equal(h.study.getState().learnGraduated.length,5);assert.equal(h.study.getState().learnStoryReady,true);
 h.study.getState().completeLearnStory();h.study.getState().completeLearnStory();assert.equal(h.study.getState().isComplete,false);
 const checkpoint=await h.study.getState().loadProgress('deck');h.study.getState().resumeSession(checkpoint,cards);
 assert.equal(h.study.getState().learnBatchComplete,true);
 h.study.getState().advanceToNextBatch();h.study.getState().advanceToNextBatch();assert.equal(h.study.getState().learnBatch.length,5);
 while(!h.study.getState().learnStoryReady)h.study.getState().answerLearnCard(true);
 h.study.getState().completeLearnStory();assert.equal(new Set(h.study.getState().learnGraduated).size,10);
 assert.equal(h.study.getState().isComplete,true);
});

test('Learn prioritizes due cards and excludes ambiguous or duplicate choices',()=>{
 const h=harness();h.srs.setState({cardSRS:Object.fromEntries(cards.slice(0,5).map(c=>[c.id,record(c.id,{next_review:'2099-01-01'})]))});
 h.study.getState().startLearnSession(cards,'deck');same(h.study.getState().learnBatch.map(c=>c.id).sort(),cards.slice(5).map(c=>c.id));
 const {makeLearnChoices}=h.load('src/lib/learnChoices.ts');
 const duplicate=[...cards,{...cards[0],id:'dup',term:' TERM-0 '},{...cards[1],id:'synonym',term:'Another correct term',definition:cards[0].definition}];
 const choices=makeLearnChoices(cards[0],duplicate);assert.equal(choices.length,4);
 assert.equal(choices.filter(c=>c.correct).length,1);assert.equal(new Set(choices.map(c=>c.text.trim().toLowerCase())).size,4);
 assert.equal(choices.some(c=>c.text==='Another correct term'),false);
 assert.equal(makeLearnChoices(cards[0],duplicate.slice(0,2)).length,0);
});

test('mastery agrees across all surfaces, missed cards stay introduced and confident is not mastered',()=>{
 const h=harness(),{getSetMastery,getMasteryChange,getMasteryLevel}=h.load('src/lib/mastery.ts');
 const records={a:record('a',{repetitions:0}),b:record('b',{repetitions:3,interval:15}),c:record('c',{repetitions:4,interval:40})};
 const ids=['a','b','c','d'],m=getSetMastery('deck',4,records,ids);
 assert.equal(m.pct,50);assert.equal(m.masteredCount,1);assert.equal(m.learningCount,2);
 assert.equal(getMasteryChange(ids.map(id=>({id})),{},records).after,m.pct);
 assert.equal(getMasteryLevel(records.a),1);assert.equal(getMasteryLevel(null),0);
 assert.equal(getSetMastery('deck',4,records).pct,m.pct);
});

test('practice before due never advances scheduling; due recall does, same-day retry cannot inflate it',async()=>{
 const clock={now:'2026-10-16T12:00:00Z'},h=harness(new Storage(),clock);
 const original=record('a',{repetitions:3,interval:15,next_review:'2026-10-30',last_seen_at:'2026-10-15T12:00:00Z'});
 h.srs.setState({cardSRS:{a:original}});await h.srs.getState().updateSRS('a','deck',true);
 assert.equal(h.srs.getState().cardSRS.a.repetitions,3);assert.equal(h.srs.getState().cardSRS.a.next_review,original.next_review);
 clock.now='2026-10-30T12:00:00Z';await h.srs.getState().updateSRS('a','deck',true);
 assert.equal(h.srs.getState().cardSRS.a.repetitions,4);
 await h.srs.getState().updateSRS('a','deck',false);const ease=h.srs.getState().cardSRS.a.easiness;
 await h.srs.getState().updateSRS('a','deck',false);assert.equal(h.srs.getState().cardSRS.a.easiness,ease);
 await h.srs.getState().updateSRS('a','deck',true);await h.srs.getState().updateSRS('a','deck',true);
 assert.equal(h.srs.getState().cardSRS.a.repetitions,1);
});

test('review due dates follow Hong Kong local midnight, not UTC',async()=>{
 const prior=process.env.TZ;process.env.TZ='Asia/Hong_Kong';
 try {
  const h=harness(new Storage(),{now:'2026-10-16T00:30:00+08:00'});
  h.srs.setState({cardSRS:{[cards[0].id]:record(cards[0].id,{next_review:'2026-10-16',last_seen_at:'2026-10-14T00:00:00Z'})}});
  same(h.srs.getState().getDueCards('deck',cards.slice(0,1)),[cards[0].id]);
  await h.srs.getState().updateSRS('new','deck',true);assert.equal(h.srs.getState().cardSRS.new.next_review,'2026-10-17');
 }finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior}
});

test('SRS and activity read beyond the server page limit without dropping earlier rows',async()=>{
 const h=harness();h.db.rows.card_srs=Array.from({length:1203},(_,i)=>record(`c-${i}`));
 await h.srs.getState().fetchAllSRS();assert.equal(Object.keys(h.srs.getState().cardSRS).length,1203);
 h.db.rows.study_sessions=Array.from({length:1203},(_,i)=>({id:`s-${i}`,completed_at:'2026-10-16T12:00:00Z',total_cards:1}));
 const p=h.load('src/store/progressStore.ts').useProgressStore;await p.getState().fetchProgress();assert.equal(p.getState().totalCardsStudied,1203);
 assert.ok(h.calls.some(c=>c.table==='study_sessions'&&c.range?.[0]===1000));
});

test('offline reload retains synced mastery and merges pending activity, including undo to zero',async()=>{
 const h=harness();h.db.rows.card_srs=[record('a')];await h.srs.getState().fetchAllSRS();
 h.db.rows.study_sessions=[{id:'previous',completed_at:new Date().toISOString(),total_cards:2}];
 const p=h.load('src/store/progressStore.ts').useProgressStore;await p.getState().fetchProgress();
 const next=harness(h.storage);next.db.error={message:'offline'};await next.srs.getState().fetchAllSRS();assert.equal(next.srs.getState().cardSRS.a.repetitions,1);
 next.study.getState().startSession(cards,'flashcard','deck');next.study.getState().markKnown();
 const progress=next.load('src/store/progressStore.ts').useProgressStore;await progress.getState().fetchProgress();assert.equal(progress.getState().totalCardsStudied,3);
 next.study.getState().undoLast();await progress.getState().fetchProgress();assert.equal(progress.getState().totalCardsStudied,2);
 next.auth.setState({user:{id:'user-b'}});next.load('src/lib/accountState.ts').changeAccount('user-b');await next.srs.getState().fetchAllSRS();await progress.getState().fetchProgress();
 assert.equal(Object.keys(next.srs.getState().cardSRS).length,0);assert.equal(progress.getState().totalCardsStudied,0);
});

test('failed later pages preserve the full cache; late activity responses cannot overwrite newer results',async()=>{
 const h=harness();const p=h.load('src/store/progressStore.ts').useProgressStore;
 h.db.rows.study_sessions=[{id:'old',completed_at:new Date().toISOString(),total_cards:4}];await p.getState().fetchProgress();
 h.db.handle=call=>call.table==='study_sessions'&&call.range?.[0]===1?{error:{message:'offline'},data:null}:undefined;
 await p.getState().fetchProgress(true);assert.equal(p.getState().totalCardsStudied,4);
 let release;h.db.handle=call=>call.table==='study_sessions'?new Promise(r=>{release=r}):undefined;
 const slow=p.getState().fetchProgress(true);await h.settle();h.db.handle=null;h.db.rows.study_sessions=[];await p.getState().fetchProgress(true);
 release({data:[],error:null});await slow;assert.equal(p.getState().totalCardsStudied,0);
});

test('reopening a draft or changing settings does not claim study activity on a new day',async()=>{
 const clock={now:'2026-10-15T12:00:00Z'},h=harness(new Storage(),clock);h.db.error={message:'offline'};
 h.study.getState().startLearnSession(cards,'deck');h.study.getState().answerLearnCard(true);
 const draft=await h.study.getState().loadProgress('deck');clock.now='2026-10-16T12:00:00Z';
 h.study.getState().resumeSession(draft,cards);await h.study.getState().persistSession();
 const saved=h.sync.pendingWrites('user-a').find(w=>w.table==='study_sessions');assert.equal(saved.data.completed_at,'2026-10-15T12:00:00.000Z');
 h.study.getState().answerLearnCard(true);
 assert.equal(h.sync.pendingWrites('user-a').find(w=>w.table==='study_sessions').data.completed_at,'2026-10-16T12:00:00.000Z');
});
