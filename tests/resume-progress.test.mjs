import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,cards} from './helpers.mjs';

const progressOf=async h=>{
 const {draftProgress}=h.load('src/store/studyStore.ts');
 const draft=await h.study.getState().loadProgress('deck');
 return draftProgress(draft);
};

test('resume prompt counts Learn progress from practised and started cards, not current_index',async()=>{
 const h=harness();h.db.error={message:'offline'};
 h.study.getState().startLearnSession(cards.slice(0,3),'deck');
 assert.equal((await progressOf(h)).hasProgress,false);
 h.study.getState().answerLearnCard(true);
 h.study.getState().answerLearnCard(false);
 let p=await progressOf(h);
 assert.equal(p.total,3);assert.equal(p.started,2);assert.equal(p.done,0);assert.equal(p.hasProgress,true);
 const first=h.study.getState().learnBatch.find(c=>h.study.getState().learnScores[c.id]===1);
 while(h.study.getState().learnBatch[h.study.getState().learnBatchIdx].id!==first.id)h.study.getState().answerLearnCard(false);
 h.study.getState().answerLearnCard(true);
 p=await progressOf(h);
 assert.equal(p.done,1);assert.ok(p.started>=p.done);
});

test('resume prompt counts linear modes by position and ignores untouched sessions',async()=>{
 const h=harness();h.db.error={message:'offline'};
 h.study.getState().startSession(cards.slice(0,4),'flashcard','deck');
 assert.equal((await progressOf(h)).hasProgress,false);
 h.study.getState().markKnown();
 h.study.setState({isAdvancing:false});
 h.study.getState().markUnknown();
 const p=await progressOf(h);
 assert.deepEqual({...p},{total:4,done:2,started:2,hasProgress:true});
});
