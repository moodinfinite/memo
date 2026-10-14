import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,cards,Storage} from './helpers.mjs';

test('deck rename preserves card IDs and uses one atomic RPC',async()=>{
 const h=harness();h.sets.setState({sets:[{id:'deck',cards,folder_id:'folder'}],currentSet:{id:'deck',cards,folder_id:'folder'}});
 await h.sets.getState().updateSet('deck','Renamed','',cards);
 const call=h.calls.find(c=>c.rpc);assert.equal(call.rpc,'save_deck');
 assert.deepEqual(Array.from(call.args.p_cards,c=>c.id),cards.map(c=>c.id));assert.equal(call.args.p_folder_id,'folder');
 assert.equal(h.calls.filter(c=>c.table==='cards'&&c.op==='delete').length,0);
});
test('failed atomic deck edit leaves local cards intact',async()=>{
 const h=harness();h.sets.setState({currentSet:{id:'deck',title:'Old',cards}});h.db.error={message:'RPC failed'};
 await assert.rejects(h.sets.getState().updateSet('deck','New','',cards));
 assert.equal(h.sets.getState().currentSet.title,'Old');assert.equal(h.sets.getState().currentSet.cards.length,10);
});
test('Master Deck saves real card deck IDs and one cross-deck session',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','__master__');h.study.getState().markKnown();
 await h.sync.flushPending();
 const srs=h.calls.find(c=>c.table==='card_srs'&&c.op==='upsert');assert.equal(srs.data.set_id,'deck');
 const session=h.calls.find(c=>c.table==='study_sessions'&&c.op==='upsert');assert.equal(session.data.set_id,null);assert.equal(session.data.total_cards,1);
});
test('immediate end retains a recoverable draft with no debounce gap',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();h.study.getState().resetSession();
 const recovered=await h.study.getState().loadProgress('deck');assert.equal(recovered.current_index,1);assert.equal(recovered.known_ids[0],'card-0');
});
test('offline reload recovers answers and unsent learning updates',async()=>{
 const storage=new Storage(),h=harness(storage);h.db.error={message:'offline'};
 h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();await h.sync.flushPending();
 assert.ok(h.sync.useSyncStatus.getState().error);assert.ok(h.sync.pendingWrites('user-a').length);
 const reloaded=harness(storage);reloaded.db.error={message:'offline'};const draft=await reloaded.study.getState().loadProgress('deck');
 reloaded.study.getState().resumeSession(draft,cards);assert.equal(reloaded.study.getState().currentIndex,1);
 await reloaded.srs.getState().fetchSRS('deck');assert.equal(reloaded.srs.getState().cardSRS['card-0'].repetitions,1);
 reloaded.db.error=null;await reloaded.sync.flushPending();assert.equal(reloaded.sync.pendingWrites('user-a').length,0);
});
test('retry, partial-save and resume keep one session ID and count answered cards only',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();await h.runTimers(400);h.study.getState().markUnknown();
 const id=h.study.getState().sessionId;await h.study.getState().persistSession();await h.study.getState().retryPersist();
 const writes=h.calls.filter(c=>c.table==='study_sessions'&&c.op==='upsert');assert.ok(writes.length);assert.ok(writes.every(c=>c.data.id===id));
 assert.equal(writes.at(-1).data.total_cards,2);assert.equal(writes.at(-1).data.score_pct,50);
});
test('completed session is queued before draft removal and survives cloud failure',async()=>{
 const h=harness();h.db.error={message:'offline'};h.study.getState().startSession(cards.slice(0,1),'flashcard','deck');h.study.getState().markKnown();await h.settle();
 assert.equal(await h.study.getState().loadProgress('deck'),null);assert.ok(h.sync.pendingWrites('user-a').some(w=>w.table==='study_sessions'));assert.equal(h.study.getState().persistSaved,false);
});
test('old quiz callback cannot mark a newly started session',async()=>{
 const h=harness();h.study.getState().startSession(cards,'multiple_choice','deck');h.study.getState().selectMCOption(h.study.getState().mcQuestions[0].correctIndex);
 h.study.getState().resetSession();h.study.getState().startSession(cards.slice(4),'flashcard','other');await h.runTimers(1000);
 assert.equal(h.study.getState().currentIndex,0);assert.equal(h.study.getState().known.length,0);
});
test('timer completion ignores a pending quiz callback and does not count unanswered cards',async()=>{
 const h=harness();h.study.getState().startSession(cards,'multiple_choice','deck',{timerDurMin:1});h.study.getState().selectMCOption(0);h.study.setState({timerSecsLeft:1});h.study.getState().tickTimer();await h.runTimers(1000);
 assert.equal(h.study.getState().known.length+h.study.getState().unknown.length,0);assert.equal(h.study.getState().isComplete,true);
});
test('Learn preserves batch, queue and within-batch scores on reload',async()=>{
 const h=harness();h.study.getState().startLearnSession(cards,'deck');const card=h.study.getState().learnBatch[0];h.study.getState().answerLearnCard(true);
 const draft=await h.study.getState().loadProgress('deck');h.study.getState().resetLearn();h.study.getState().resumeSession(draft,cards);
 assert.equal(h.study.getState().learnActive,true);assert.equal(h.study.getState().learnScores[card.id],1);assert.equal(h.study.getState().learnQueue.length,5);assert.equal(h.study.getState().learnBatchIdx,1);
});
test('sentence text and elapsed timer survive resume, failed review is not a correct answer',async()=>{
 const h=harness();h.study.getState().startSession(cards,'sentence','deck',{timerDurMin:3});h.study.getState().setSentenceInput('My unfinished sentence');h.study.getState().tickTimer();
 const draft=await h.study.getState().loadProgress('deck');h.study.getState().resetSession();h.study.getState().resumeSession(draft,cards);
 assert.equal(h.study.getState().sentenceInput,'My unfinished sentence');assert.equal(h.study.getState().timerSecsLeft,179);
 await h.study.getState().submitSentence();h.study.getState().nextSentenceCard();assert.equal(h.study.getState().currentIndex,0);assert.equal(h.study.getState().sentenceScore,null);assert.ok(h.study.getState().sentenceError);
});
test('undo is persisted and removed cards do not skip surviving cards on resume',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();h.study.getState().undoLast();
 const draft=await h.study.getState().loadProgress('deck');assert.equal(draft.current_index,0);assert.equal(draft.known_ids.length,0);
 draft.current_index=2;draft.known_ids=['card-0','card-1'];h.study.getState().resumeSession(draft,cards.slice(1));assert.equal(h.study.getState().currentIndex,1);assert.equal(h.study.getState().sessionCards[1].id,'card-2');
});
test('another account never drains the previous account outbox',async()=>{
 const h=harness();h.db.error={message:'offline'};h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();await h.sync.flushPending();h.calls.length=0;
 h.auth.setState({user:{id:'user-b'}});h.sync.activateSync('user-b');await h.sync.flushPending();assert.equal(h.calls.length,0);assert.ok(h.sync.pendingWrites('user-a').length);
});
test('auth initialization is idempotent and auth callback is synchronous',async()=>{
 const h=harness();await Promise.all([h.auth.getState().init(),h.auth.getState().init()]);assert.equal(h.db.registrations,1);
 assert.equal(h.db.authCallback('SIGNED_IN',{user:{id:'user-b'}}),undefined);assert.equal(h.auth.getState().user.id,'user-b');
 h.sets.setState({sets:[{id:'private'}]});h.srs.setState({cardSRS:{private:{repetitions:5}}});await h.auth.getState().logout();assert.equal(h.sets.getState().sets.length,0);assert.equal(Object.keys(h.srs.getState().cardSRS).length,0);
});
test('newer cloud draft wins over a synced local draft',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');await h.sync.flushPending();
 h.db.rows.session_drafts={...h.sync.readLocal('memo:draft:user-a:deck'),current_index:3,updated_at:'2099-01-01T00:00:00Z'};
 assert.equal((await h.study.getState().loadProgress('deck')).current_index,3);
});
test('an old in-flight save cannot remove its newer queued replacement',async()=>{
 const h=harness();await h.settle();let resolve;
 h.db.handle=()=>new Promise(r=>{resolve=r});
 h.sync.queueWrite({userId:'user-a',key:'srs:card-0',table:'card_srs',operation:'upsert',data:{card_id:'card-0',repetitions:1},conflict:'user_id,card_id'});
 const saving=h.sync.flushPending();await h.settle();
 h.sync.queueWrite({userId:'user-a',key:'srs:card-0',table:'card_srs',operation:'upsert',data:{card_id:'card-0',repetitions:2},conflict:'user_id,card_id'});
 resolve({error:null});await saving;assert.equal(h.sync.pendingWrites('user-a')[0].data.repetitions,2);
 h.db.handle=null;await h.sync.flushPending();assert.equal(h.sync.pendingWrites('user-a').length,0);
});
test('an old draft upsert finishing after completion cannot resurrect the cleared draft',async()=>{
 const h=harness();await h.settle();let resolve;
 h.study.getState().startSession(cards,'flashcard','deck');h.db.handle=call=>call.table==='session_drafts'&&call.op==='upsert'?new Promise(r=>{resolve=r}):undefined;
 const saving=h.sync.flushPending();await h.settle();await h.study.getState().clearProgress('deck');resolve({error:null});await saving;
 assert.equal(h.sync.pendingWrites('user-a').find(w=>w.table==='session_drafts').operation,'delete');assert.equal(await h.study.getState().loadProgress('deck'),null);
 h.db.handle=null;await h.sync.flushPending();assert.ok(h.calls.some(c=>c.table==='session_drafts'&&c.op==='delete'));
});
test('storage failure is visible instead of falsely promising durable local recovery',async()=>{
 const storage=new Storage();storage.setItem=()=>{throw new Error('quota')};const h=harness(storage);
 h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();assert.equal(h.sync.useSyncStatus.getState().storageError,true);assert.ok(h.sync.pendingWrites('user-a').length);
});
test('undoing the only answer replaces its previously queued session count with zero',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();h.study.getState().undoLast();
 const job=h.sync.pendingWrites('user-a').find(w=>w.table==='study_sessions');assert.equal(job.data.total_cards,0);assert.equal(job.data.known_count,0);
});
test('a synced draft cleared on another device is not resurrected from local cache',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');await h.sync.flushPending();h.db.rows.session_drafts=null;
 assert.equal(await h.study.getState().loadProgress('deck'),null);
});
