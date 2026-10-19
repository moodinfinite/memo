import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,cards} from './helpers.mjs';

const srs=(id,next_review,repetitions=1,interval=1)=>({card_id:id,set_id:'deck',repetitions,interval,easiness:2.5,next_review,last_seen_at:'2026-10-01T00:00:00Z'});
const ids=list=>Array.from(list,c=>c.id);

test('Daily 10 takes overdue reviews first, up to three new words, then the weakest other cards',()=>{
 const {pickDailyCards}=harness().load('src/lib/daily.ts');
 const today='2026-10-19';
 // card-0..3 due (card-2 most overdue), card-4..5 seen but not due, card-6..9 new
 const map={'card-0':srs('card-0','2026-10-18'),'card-1':srs('card-1','2026-10-19'),'card-2':srs('card-2','2026-10-10'),'card-3':srs('card-3','2026-10-15'),
  'card-4':srs('card-4','2026-11-20',4,30),'card-5':srs('card-5','2026-10-25',2,4)};
 const picks=ids(pickDailyCards(cards,map,today));
 assert.equal(picks.length,10);
 assert.deepEqual(picks.slice(0,4),['card-2','card-3','card-0','card-1']);
 assert.deepEqual(picks.slice(4,7),['card-6','card-7','card-8']);
 assert.deepEqual(picks.slice(7,9),['card-5','card-4']);
 assert.equal(picks[9],'card-9');
 assert.equal(new Set(picks).size,10);
});

test('Daily 10 gives a brand-new library all new words and honours exclusions',()=>{
 const {pickDailyCards}=harness().load('src/lib/daily.ts');
 assert.deepEqual(ids(pickDailyCards(cards,{},'2026-10-19')),ids(cards));
 const more=ids(pickDailyCards(cards,{},'2026-10-19',new Set(['card-0','card-1'])));
 assert.equal(more.length,8);assert.ok(!more.includes('card-0'));
 const many=Array.from({length:30},(_,i)=>({...cards[0],id:`due-${i}`}));
 const dueMap=Object.fromEntries(many.map(c=>[c.id,srs(c.id,'2026-10-01')]));
 const mixed=ids(pickDailyCards([...many,...cards],dueMap,'2026-10-19'));
 assert.equal(mixed.filter(id=>id.startsWith('due-')).length,7);assert.equal(mixed.filter(id=>id.startsWith('card-')).length,3);
});

test('daily session id is a stable UUID per account and day',()=>{
 const {dailySessionId}=harness().load('src/lib/daily.ts');
 const a=dailySessionId('user-a','2026-10-19');
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(dailySessionId('user-a','2026-10-19'),a);
 assert.notEqual(dailySessionId('user-a','2026-10-20'),a);
 assert.notEqual(dailySessionId('user-b','2026-10-19'),a);
});

test('Daily 10 status: unfinished today continues, a recorded session means done',()=>{
 const {dailyState,dailySessionId}=harness().load('src/lib/daily.ts');
 const today='2026-10-19',id=dailySessionId('user-a',today);
 const draft={updated_at:'2026-10-19T09:00:00',mode:'flashcard'};
 assert.deepEqual({...dailyState(draft,{started:4,total:10,hasProgress:true},[id],'user-a',today)},{status:'continue',done:4,total:10});
 assert.equal(dailyState(null,null,[id],'user-a',today).status,'done');
 assert.equal(dailyState(null,null,[],'user-a',today).status,'start');
 assert.equal(dailyState({...draft,updated_at:'2026-10-18T09:00:00'},{started:4,total:10,hasProgress:true},[],'user-a',today).status,'start');
});

test('a finished Daily round records today\'s session id with no set and clears its draft',async()=>{
 const h=harness();const {dailySessionId,DAILY_SCOPE}=h.load('src/lib/daily.ts');
 const id=dailySessionId('user-a','2026-10-19');
 h.study.getState().startSession(cards.slice(0,2),'flashcard',DAILY_SCOPE,{sessionId:id});
 await h.sync.flushPending();
 const draftWrite=h.calls.find(c=>c.table==='session_drafts'&&c.op==='upsert');
 assert.equal(draftWrite.data.set_id,null);assert.equal(draftWrite.data.scope_id,DAILY_SCOPE);
 h.study.getState().markKnown();await h.runTimers(400);h.study.getState().markUnknown();await h.settle();await h.sync.flushPending();
 const sessions=h.calls.filter(c=>c.table==='study_sessions'&&c.op==='upsert');
 assert.ok(sessions.length);assert.ok(sessions.every(c=>c.data.id===id&&c.data.set_id===null&&c.data.mode==='flashcard'));
 assert.equal(sessions.at(-1).data.total_cards,2);
 assert.equal(await h.study.getState().loadProgress(DAILY_SCOPE),null);
});
