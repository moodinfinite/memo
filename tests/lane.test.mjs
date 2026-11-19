import test from 'node:test';
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
