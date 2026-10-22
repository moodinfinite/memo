import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

const lib=()=>harness().load('src/lib/levelTest.ts');
// Five items in the usual mix; `right` says which ones the learner got correct
const stage=(level,right)=>{
 const skills=['vocabulary','vocabulary','grammar','grammar','reading'];
 const items=skills.map(skill=>({skill,passage:'',question:'q',options:['a','b','c','d'],answer:1,explanation:''}));
 return {level,items,answers:items.map((_,i)=>right.includes(i)?1:0)};
};

test('staircase climbs on 4/5, drops on 2/5, settles on 3/5, and never repeats a level',()=>{
 const {nextStageLevel}=lib();
 assert.equal(nextStageLevel([stage(2,[0,1,2,3])]),3);
 assert.equal(nextStageLevel([stage(2,[0,1])]),1);
 assert.equal(nextStageLevel([stage(2,[0,1,2])]),null);
 assert.equal(nextStageLevel([stage(2,[0,1,2,3]),stage(3,[0])]),null,'dropping back to a level already tried stops');
 assert.equal(nextStageLevel([stage(6,[0,1,2,3,4])]),null);
 assert.equal(nextStageLevel([stage(1,[])]),null);
 assert.equal(nextStageLevel([stage(1,[0,1,2,3,4]),stage(2,[0,1,2,3,4]),stage(3,[0,1,2,3,4]),stage(4,[0,1,2,3,4])]),null,'four stages at most');
});

test('estimate is the highest level passed at 60%, or one below the lowest level tried',()=>{
 const {estimateLevel}=lib();
 assert.equal(estimateLevel([stage(2,[0,1,2,3]),stage(3,[0,1,2])]),3);
 assert.equal(estimateLevel([stage(2,[0,1,2,3]),stage(3,[0])]),2);
 assert.equal(estimateLevel([stage(2,[0]),stage(1,[0])]),1);
 assert.equal(estimateLevel([stage(4,[])]),3);
 assert.equal(estimateLevel([]),1);
});

test('per-skill levels and the writing nudge',()=>{
 const {buildResult,skillLevel,overallLevel}=lib();
 const stages=[stage(3,[0,1,2,3]),stage(4,[0,1,4])];
 assert.equal(skillLevel(stages,'vocabulary'),4);
 assert.equal(skillLevel(stages,'grammar'),3);
 assert.equal(skillLevel(stages,'reading'),4);
 assert.equal(overallLevel(4,null),4);
 assert.equal(overallLevel(4,2),4);
 assert.equal(overallLevel(4,1),3);
 const result=buildResult(stages,3,new Date('2026-10-21T12:00:00Z'));
 assert.equal(result.level,4);assert.equal(result.date,'2026-10-21T12:00:00.000Z');
 assert.equal(result.skills.writing,3);
});

test('history is newest first, capped, and the check is due monthly',()=>{
 const {levelHistory,withResult,isLevelCheckDue,startLevel}=lib();
 const meta={memo_levels:[{date:'2026-08-01T00:00:00Z',level:2,skills:{}},{date:'2026-09-01T00:00:00Z',level:3,skills:{}},{date:'nope',level:5},null]};
 const history=levelHistory(meta);
 assert.deepEqual(Array.from(history,r=>r.level),[3,2]);
 assert.equal(startLevel(history),3);assert.equal(startLevel([]),2);
 assert.equal(isLevelCheckDue([]),true);
 assert.equal(isLevelCheckDue(history,new Date('2026-09-20T00:00:00Z')),false);
 assert.equal(isLevelCheckDue(history,new Date('2026-10-01T00:00:00Z')),true);
 let many=[];for(let m=1;m<=9;m++)many=withResult(many,{date:`2026-0${m}-01T00:00:00Z`,level:m%6+1,skills:{}});
 assert.equal(many.length,6);assert.equal(many[0].date,'2026-09-01T00:00:00Z');
 assert.equal(levelHistory(undefined).length,0);
});

test('writing is a sentence through HSK 3 and a paragraph from HSK 4',()=>{
 const {isParagraphTask,writingTask}=lib();
 assert.equal(isParagraphTask(3),false);assert.equal(isParagraphTask(4),true);
 assert.ok(writingTask(9).prompt.includes('200'));
});

test('profile stats compare each skill with the previous check and name a rank',()=>{
 const {skillStats,rankFor}=lib();
 const history=[{date:'2026-10-01T00:00:00Z',level:3,skills:{vocabulary:4,grammar:3,reading:null,writing:2}},
  {date:'2026-09-01T00:00:00Z',level:2,skills:{vocabulary:3,grammar:3,reading:2,writing:2}}];
 const stats=skillStats(history);
 assert.equal(stats.length,4);
 assert.equal(stats[0].skill,'vocabulary');assert.equal(stats[0].level,4);assert.equal(stats[0].previous,3);
 assert.equal(stats[2].level,null);
 assert.equal(skillStats([]).every(s=>s.level===null&&s.previous===null),true);
 assert.equal(skillStats([history[0]])[0].previous,null);
 assert.equal(rankFor(3).en,'Scholar');assert.equal(rankFor(9).zh,'宗師');
});
