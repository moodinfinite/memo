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
