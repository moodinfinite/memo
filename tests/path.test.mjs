import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

const lib=()=>harness().load('src/lib/path.ts');
const W=(level,form,meaning='m')=>({level,forms:[form],pinyin:'p',meaning,pos:'N'});

test('units: most useful section first, topics take turns, small leftovers join the last unit',()=>{
 const P=lib();
 const words=[]; const lines=[];
 // 8 food words (use 5), 6 travel words (use 4), 2 general words (use 2), one Level 2 word that must be ignored
 for(let i=0;i<8;i++){words.push(W(3,'食'+i));lines.push(`3\t食${i}\tfood\t5\tex\ten`);}
 for(let i=0;i<6;i++){words.push(W(3,'行'+i));lines.push(`3\t行${i}\ttravel\t4\tex\ten`);}
 for(let i=0;i<2;i++){words.push(W(3,'的'+i));lines.push(`3\t的${i}\tgeneral\t2\tex\ten`);}
 words.push(W(2,'朋友'));
 const tags=P.parsePathTags(lines.join('\n'));
 const units=P.buildUnits(words,tags,3);
 assert.deepEqual([...units.map(u=>[u.section,u.theme,u.words.length])],[[0,'food',8],[0,'travel',6],[2,'general',2]]);
 assert.deepEqual([...units.map(u=>u.index)],[0,1,2]);
 assert.deepEqual([...P.taggedLevels(tags)],[3]);
});

test('word states and unit stages follow your cards and reviews',()=>{
 const P=lib();
 const cards=[{id:'own',set_id:'mine',term:'路口',definition:'lùkǒu — intersection'},{id:'p1',set_id:'path',term:'方便',definition:'convenient'},{id:'p2',set_id:'path',term:'機會',definition:'chance'}];
 const index=P.indexCards(cards,new Set(['path']));
 const seen=id=>id==='p2';
 const st=f=>P.wordState(W(3,f),index,seen).state;
 assert.deepEqual([st('路口'),st('方便'),st('機會'),st('經驗')],['own','added','seen','new']);
 assert.equal(P.unitStage(['own','own']),'skip');
 assert.equal(P.unitStage(['own','new','seen']),'sweep');
 assert.equal(P.unitStage(['added','seen']),'learn');
 assert.equal(P.unitStage(['seen','own']),'check');
});

test('progress is read defensively and cards keep the "pinyin — meaning" shape',()=>{
 const P=lib();
 assert.deepEqual(JSON.parse(JSON.stringify(P.readProgress({memo_path:{start:2,done:{'2':3,x:1,'3':-1}}}))),{start:2,done:{'2':3}});
 assert.deepEqual(JSON.parse(JSON.stringify(P.readProgress(null))),{done:{}});
 assert.deepEqual({...P.pathCard(W(2,'路口','crossing; intersection (of roads)'))},{term:'路口',definition:'p — crossing; intersection'});
 assert.equal(P.pathSetTitle(3),'Path · Level 3');
});

test('alley lights follow finished units, with the current unit warming the next light',()=>{
 const P=lib();
 let l=P.pathLights(89,0,0,35); assert.deepEqual([l.lit,l.toNext,l.warmth],[0,3,0]);
 l=P.pathLights(89,3,0,35); assert.equal(l.lit,1);
 l=P.pathLights(89,4,P.STAGE_PART.check,35); assert.equal(l.lit,1); assert.ok(l.warmth>0.5&&l.warmth<0.9);
 l=P.pathLights(89,88,0,35); assert.equal(l.lit,34,'the last light needs every unit');
 l=P.pathLights(89,89,0,35); assert.deepEqual([l.lit,l.toNext],[35,0]);
 assert.equal(P.unitsForLight([...Array(89).keys()],0,35).length,3);
});

test('test out: section and level targets, samples only new words, 80% to pass',()=>{
 const P=lib();
 const u=(index,section,n)=>({index,level:2,section,theme:'food',words:Array.from({length:n},(_,k)=>W(2,`字${index}-${k}`))});
 const units=[u(0,0,6),u(1,0,6),u(2,1,6),u(3,2,6)];
 assert.equal(P.testOutTarget(units,1,'section'),2);
 assert.equal(P.testOutTarget(units,2,'section'),3);
 assert.equal(P.testOutTarget(units,0,'level'),4);
 const states=units.map(x=>x.words.map((_,k)=>k===0?'own':'new'));
 const sample=P.testOutSample(units,states,1,4,100,()=>0.5);
 assert.equal(sample.length,15,'5 new words in each of units 1-3');
 assert.ok(sample.every(w=>!w.forms[0].endsWith('-0')),'words already in your sets are left out');
 assert.equal(P.testOutSample(units,states,0,4,10).length,10);
 assert.ok(P.testOutPassed(8,10)); assert.ok(!P.testOutPassed(7,10)); assert.ok(P.testOutPassed(12,15)); assert.ok(!P.testOutPassed(0,0));
});

test('units of about 10: topics split evenly, small topics pooled, stray words join the smallest unit',()=>{
 const P=lib();
 const words=[]; const lines=[];
 const add=(n,form,theme,use)=>{for(let i=0;i<n;i++){words.push(W(3,form+i));lines.push(`3\t${form}${i}\t${theme}\t${use}\tex\ten`);}};
 add(23,'食','food',5); add(7,'行','travel',5); add(3,'家','home',5); // section 0: 23 → 12+11, 7 → 7, 3 stray → smallest (7 → 10)
 add(3,'工','work',3); add(4,'學','education',3);                   // section 1: two small topics pool into one mixed unit
 const units=P.buildUnits(words,P.parsePathTags(lines.join('\n')),3);
 assert.deepEqual([...units.map(u=>[u.section,u.theme,u.words.length])],[[0,'food',12],[0,'travel',10],[0,'food',11],[1,'mixed',7]]);
 assert.deepEqual({...P.sectionPlace(units,units[2])},{n:3,of:3});
 assert.deepEqual({...P.sectionPlace(units,units[3])},{n:1,of:1});
 assert.equal(P.buildUnits(words,P.parsePathTags(lines.join('\n')),3,1).length,8,'layout 1 still rebuilds the 6-word units');
});

test('progress from the 6-word layout carries over by the words it covered',()=>{
 const P=lib();
 const words=[]; const lines=[];
 for(let i=0;i<20;i++){words.push(W(3,'食'+i));lines.push(`3\t食${i}\tfood\t5\tex\ten`);}
 const tags=P.parsePathTags(lines.join('\n'));
 // old layout: 6+6+8 → three units; new: 10+10
 const m=(done)=>P.migrateProgress({start:3,done:{'3':done}},words,tags);
 assert.equal(m(1).done['3'],0,'6 of the first 10 words covered: that unit comes back');
 assert.equal(m(2).done['3'],1,'12 words covered: the first new unit is done');
 assert.equal(m(3).done['3'],2);
 assert.equal(m(2).v,P.PATH_LAYOUT);
 const already={start:3,done:{'3':1},v:P.PATH_LAYOUT};
 assert.equal(P.migrateProgress(already,words,tags),already,'current progress is left alone');
});
