import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

const lib=()=>harness().load('src/lib/lane.ts');
const W=(level,forms,pinyin='p',meaning='m')=>({level,forms,pinyin,meaning,pos:'N'});
const list=[W(3,['經驗']),W(3,['機會']),W(3,['討論']),W(3,['裡面','裏面']),W(2,['朋友']),W(3,['方便'])];
const srs=(id,repetitions,interval,seen='2026-11-01')=>({card_id:id,set_id:'s',easiness:2.5,interval,repetitions,next_review:'2026-12-01',last_seen_at:seen});

test('only Familiar Level 3 words in your sets count, matched by Chinese characters',()=>{
 const L=lib();
 const cards=[
  {id:'a',term:'經驗 (jīngyàn)',definition:'experience'},      // pinyin in the term is ignored
  {id:'b',term:'opportunity',definition:'機會'},                 // Chinese on the definition side
  {id:'c',term:'討論',definition:'to discuss'},                  // started, not Familiar
  {id:'d',term:'朋友',definition:'friend'},                      // Level 2: doesn't count
  {id:'e',term:'裏面／里面',definition:'inside'},                // a listed variant form
  {id:'f',term:'經驗',definition:'experience (dup)'},           // a second card for the same word counts once
 ];
 const p=L.laneProgress(list,cards,{a:srs('a',2,3,'2026-11-03'),b:srs('b',4,21,'2026-11-01'),c:srs('c',1,1),d:srs('d',4,30),e:srs('e',3,10,'2026-11-02'),f:srs('f',0,1)});
 assert.equal(p.total,5);
 assert.deepEqual([...p.familiar.map(w=>w.form)],['機會','裡面','經驗'],'oldest study first, list spelling shown');
 assert.equal(p.started,1);
});

test('lights: words per light, warming from started words, and a fully lit lane',()=>{
 const L=lib();
 const fam=n=>Array.from({length:n},(_, i)=>({form:String(i),pinyin:'',meaning:''}));
 let l=L.laneLights({total:1088,familiar:fam(0),started:0},35);
 assert.deepEqual([l.per,l.lit,l.warmth,l.toNext],[31,0,0,32]);
 // thresholds for 1088 words over 35 lights: 32, 63, 94, …
 l=L.laneLights({total:1088,familiar:fam(70),started:4},35);
 assert.equal(l.lit,2); assert.equal(l.toNext,24); assert.ok(Math.abs(l.warmth-(7+2)/31)<1e-9);
 l=L.laneLights({total:1088,familiar:fam(1087),started:0},35);
 assert.equal(l.lit,34,'the last light needs every word');
 l=L.laneLights({total:1088,familiar:fam(31),started:200},35);
 assert.equal(l.warmth,0.9,'warming is capped below a real light');
 l=L.laneLights({total:1088,familiar:fam(1088),started:0},35);
 assert.deepEqual([l.lit,l.warmth,l.toNext],[35,0,0]);
 assert.deepEqual([...L.wordsForLight({total:9,familiar:fam(7),started:0},1,3).map(w=>w.form)],['3','4','5']);
});

test('all 1,093 path entries can be introduced, matched back to a card and progressed', () => {
  const h = harness();
  const L = h.load('src/lib/lane.ts');
  const { parseWordList } = h.load('src/lib/levelTest.ts');
  const list = parseWordList(readFileSync('public/tocfl.txt', 'utf8'));
  const path = list.filter(word => word.level === L.LANE_LEVEL);
  const setId = L.laneSetId('user-a');
  const cards = path.map((word, position) => ({
    id: L.laneCardId(setId, word.forms[0]), term: word.forms[0], definition: '', position,
  }));
  const records = Object.fromEntries(cards.map(card => [card.id, srs(card.id, 2, 3)]));
  assert.equal(path.length, 1093);
  assert.equal(L.laneProgress(list, cards, records).familiar.length, path.length);
  assert.equal(L.planLaneLesson(list, cards, records, '2026-11-19').complete, true);
  for (let from = 0; from < path.length; from += L.MAX_NEW_LANE_WORDS) {
    const { picks } = L.planLaneLesson(path.slice(from), [], {}, '2026-11-19');
    assert.ok(picks.every(pick => pick.meaning.trim()));
    assert.deepEqual(Array.from(picks, pick => pick.word.forms[0]), Array.from(path.slice(from, from + L.MAX_NEW_LANE_WORDS), word => word.forms[0]));
  }
});

test('due path words lead, personal history carries over, and tomorrow’s reviews wait', () => {
  const L = lib();
  const cards = [{id:'known', term:'經驗', definition:'experience'}, {id:'due', term:'裏面', definition:'inside'}, {id:'later', term:'機會', definition:'chance'}];
  const records = { known:srs('known',2,3), due:{...srs('due',1,1),next_review:'2026-11-18'}, later:srs('later',1,1) };
  const result = L.planLaneLesson(list, cards, records, '2026-11-19');
  assert.deepEqual(Array.from(result.picks, pick => pick.word.forms[0]), ['裡面','討論','方便']);
  assert.equal(result.picks[0].card.id, 'due');
  assert.equal(L.laneSetId('user-a'), L.laneSetId('user-a'));
  assert.notEqual(L.laneSetId('user-a'), L.laneSetId('user-b'));
});

test('alley admission fits the daily budget and includes due Familiar words for delayed recall', () => {
  const L = lib();
  const words = Array.from({length: 24}, (_, i) => W(3, [String.fromCodePoint(0x4e00 + i)]));
  for (const [due, reviews, fresh] of [[0,0,3], [2,2,3], [4,4,2], [6,6,1], [7,7,0], [12,8,0]]) {
    const cards = words.slice(0, due).map(word => ({id:word.forms[0], term:word.forms[0], definition:'meaning'}));
    const records = Object.fromEntries(cards.map(card => [card.id, {...srs(card.id,3,10), next_review:'2026-11-18'}]));
    const {picks} = L.planLaneLesson(words, cards, records, '2026-11-19');
    assert.equal(picks.filter(pick => pick.card).length, reviews);
    assert.equal(picks.filter(pick => !pick.card).length, fresh);
    assert.ok(picks.slice(0, reviews).every(pick => pick.card));
  }
  assert.notEqual(L.lanePracticeId('me','2026-11-19'), L.lanePracticeId('me','2026-11-20'));
});
