import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, cards } from './helpers.mjs';

test('quick edit updates only the intended card and preserves position, answers, and mastery',async()=>{
 const h=harness();h.study.getState().startSession(cards,'flashcard','deck');h.study.getState().markKnown();await h.runTimers(400);
 const card=h.study.getState().sessionCards[1],updated={...card,term:'Edited',definition:'New definition'};
 h.sets.setState({currentSet:{id:'deck',cards},sets:[{id:'deck',cards}]});
 const before=h.study.getState(),mastery=JSON.stringify(h.srs.getState().cardSRS);
 h.db.rows.cards=updated;
 const result=await h.sets.getState().updateCard(card,'Edited','New definition');h.study.getState().replaceCard(result);
 const after=h.study.getState();assert.equal(after.sessionId,before.sessionId);assert.equal(after.currentIndex,1);
 assert.deepEqual(after.known,before.known);assert.equal(JSON.stringify(h.srs.getState().cardSRS),mastery);
 assert.equal(after.sessionCards[1].term,'Edited');assert.equal(h.sets.getState().currentSet.cards[1].term,'Edited');
 const write=h.calls.find(c=>c.table==='cards'&&c.op==='update');
 assert.deepEqual(write.filters,{id:card.id,set_id:'deck',user_id:'user-a'});
 assert.deepEqual(write.data,{term:'Edited',definition:'New definition'});
 assert.equal(h.calls.some(c=>c.op==='delete'),false);
});
test('failed quick edit leaves original card intact and rejects empty or wrong-account edits',async()=>{
 const h=harness();h.sets.setState({currentSet:{id:'deck',cards}});h.db.error={message:'offline'};
 await assert.rejects(h.sets.getState().updateCard(cards[0],'Edited','Definition'));
 assert.equal(h.sets.getState().currentSet.cards[0].term,cards[0].term);
 await assert.rejects(h.sets.getState().updateCard(cards[0],'   ','Definition'));
 await assert.rejects(h.sets.getState().updateCard({...cards[0],user_id:'other'},'Edited','Definition'));
});
test('editor pauses timer and prevents keyboard answers until it closes',()=>{
 const h=harness();h.study.getState().startSession(cards,'multiple_choice','deck',{timerDurMin:1});
 h.study.setState({editingCard:true});h.study.getState().tickTimer();h.study.getState().selectMCOption(0);h.study.getState().markKnown();
 assert.equal(h.study.getState().timerSecsLeft,60);assert.equal(h.study.getState().selectedOption,null);assert.equal(h.study.getState().known.length,0);
 h.study.setState({editingCard:false});h.study.getState().tickTimer();assert.equal(h.study.getState().timerSecsLeft,59);
});
test('edited quiz answer and Learn batch reflect the new text without resetting learning scores',()=>{
 const h=harness();h.study.getState().startSession(cards,'multiple_choice','deck');
 h.study.getState().replaceCard({...cards[0],definition:'Corrected definition'});
 const question=h.study.getState().mcQuestions[0];assert.equal(question.options[question.correctIndex],'Corrected definition');
 h.study.getState().startLearnSession(cards,'deck');h.study.getState().answerLearnCard(true);
 const current=h.study.getState().learnBatch[h.study.getState().learnBatchIdx],scores=h.study.getState().learnScores;
 h.study.getState().replaceCard({...current,term:'Corrected term'});
 assert.equal(h.study.getState().learnBatch[h.study.getState().learnBatchIdx].term,'Corrected term');
 assert.deepEqual(h.study.getState().learnScores,scores);
});
test('mastery comparison survives refresh and distinguishes gains, losses, and no change',async()=>{
 const h=harness();const mastery=h.load('src/lib/mastery.ts');
 h.srs.setState({cardSRS:{[cards[0].id]:{...cards[0],card_id:cards[0].id,repetitions:4,interval:21}}});
 h.study.getState().startSession(cards,'flashcard','deck');const baseline=h.study.getState().masteryBefore;
 const change=mastery.getMasteryChange(cards,baseline,{});assert.equal(change.before,10);assert.equal(change.after,0);assert.equal(change.delta,-10);
 assert.equal(mastery.getMasteryChange(cards,{},h.srs.getState().cardSRS).delta,10);
 assert.equal(mastery.getMasteryChange([],{},{}).delta,0);
 const draft=await h.study.getState().loadProgress('deck');h.study.getState().resetSession();h.study.getState().resumeSession(draft,cards);
 assert.deepEqual(h.study.getState().masteryBefore,baseline);
 h.study.getState().resumeSession({...draft,state:{}},cards);assert.equal(h.study.getState().masteryBefore,null);
});
