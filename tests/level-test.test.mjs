import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';
import { buildWordList, parseCSV } from '../scripts/build-tocfl.mjs';

const lib=()=>harness().load('src/lib/levelTest.ts');
// A seeded random source so simulated learners are repeatable
const seeded=(seed=7)=>()=>(seed=(seed*16807)%2147483647)/2147483647;
const word=(L,level,score)=>({difficulty:L.wordDifficulty(level),guess:0,score,kind:'word'});

test('the estimate starts low, climbs with right answers and reports the conservative end',()=>{
 const L=lib();
 assert.equal(L.nextWordLevel(L.estimate([])),1,'first words come from Level 1');
 const strong=[0,1,2,3,3,4,4,4].map(l=>word(L,l,1));
 assert.ok(L.estimate(strong).mean>L.estimate([]).mean);
 const allWrong=Array.from({length:10},()=>word(L,1,0));
 assert.equal(L.levelAt(L.estimate(allWrong),0.7),0);
 const e=L.estimate([...Array(6)].map(()=>word(L,3,1)).concat([...Array(6)].map(()=>word(L,4,0))));
 assert.ok(L.levelAt(e,0.7)<=L.levelAt(e,0.3),'headline is never above the top of the range');
});

test('simulated learners land on their level or one below, never two above',()=>{
 const L=lib(),random=seeded();
 for(const truth of [0.5,1.5,2.5,3.5,4.5]){
  for(let run=0;run<20;run++){
   const answers=[];let e=L.estimate(answers);
   while(!L.wordsDone(answers,e)){
    const a=word(L,L.nextWordLevel(e),0);a.score=random()<L.pCorrect(truth,a)?1:0;
    answers.push(a);e=L.estimate(answers);
   }
   const n=answers.length;assert.ok(n>=L.MIN_WORDS&&n<=L.MAX_WORDS);
   const level=L.buildResult(answers,null,null).level;
   assert.ok(level<=Math.floor(truth)+1,`truth ${truth} gave ${level}`);
   assert.ok(level>=Math.floor(truth)-2,`truth ${truth} gave ${level}`);
  }
 }
});

test('guessing on four-option reading questions counts for less than typed recall',()=>{
 const L=lib();
 const typed=L.estimate([...Array(5)].map(()=>word(L,3,1)));
 const guessed=L.estimate([...Array(5)].map(()=>({difficulty:L.wordDifficulty(3),guess:0.25,score:1,kind:'reading'})));
 assert.ok(typed.mean>guessed.mean);
});

test('a hard real-world text caps the result one level lower and the result is saved on the TOCFL scale',()=>{
 const L=lib();
 const answers=[...Array(20)].map((_,i)=>word(L,i%2?2:3,i%3?1:0));
 const plain=L.buildResult(answers,2,'most',new Date('2026-11-12T12:00:00Z'));
 const capped=L.buildResult(answers,2,'little');
 assert.equal(plain.scale,'tocfl');assert.equal(plain.date,'2026-11-12T12:00:00.000Z');
 assert.equal(plain.skills.writing,2);assert.equal(plain.skills.reading,null);
 assert.equal(capped.level,Math.max(0,plain.level-1));assert.equal(capped.capped,plain.level>0);
});

test('old HSK results stay in history but do not count for the badge, stats or due date',()=>{
 const L=lib();
 const meta={memo_levels:[{date:'2026-10-20T00:00:00Z',level:5,skills:{vocabulary:5}},{date:'nope',level:5},null]};
 const history=L.levelHistory(meta);
 assert.equal(history.length,1);assert.equal(L.isLegacy(history[0]),true);
 assert.equal(L.currentResults(history).length,0);
 assert.equal(L.isLevelCheckDue(history,new Date('2026-10-21T00:00:00Z')),true,'legacy results make the new check due');
 assert.equal(L.skillStats(history).every(s=>s.level===null),true);
 const fresh={date:'2026-11-01T00:00:00Z',level:2,scale:'tocfl',skills:{vocabulary:2,reading:1,writing:1}};
 const both=L.withResult(history,fresh);
 assert.equal(L.isLevelCheckDue(both,new Date('2026-11-20T00:00:00Z')),false);
 assert.equal(L.isLevelCheckDue(both,new Date('2026-12-01T00:00:00Z')),true);
 assert.equal(L.skillStats(both)[0].level,2);
 let many=[];for(let m=1;m<=9;m++)many=L.withResult(many,{date:`2026-0${m}-01T00:00:00Z`,level:1,scale:'tocfl',skills:{}});
 assert.equal(many.length,6);
});

test('typed meanings match dictionary senses, and unclear ones go to Claude',()=>{
 const {matchMeaning}=lib();
 assert.equal(matchMeaning('porridge','congee; gruel; porridge'),1);
 assert.equal(matchMeaning('Red','red (color); revolutionary'),1);
 assert.equal(matchMeaning('to push something','to push; to cut; to refuse'),1);
 assert.equal(matchMeaning('pushing','to push; to cut'),1);
 assert.equal(matchMeaning('blood pressure','blood pressure'),1);
 assert.equal(matchMeaning('pressure','blood pressure'),null,'half a phrase needs a closer look');
 assert.equal(matchMeaning('happy','glad; pleased'),null);
 assert.equal(matchMeaning('','glad'),0);
 assert.equal(matchMeaning('the','glad'),null);
});

test('words are sampled by level, skip ones already asked and mostly avoid flashcard words',()=>{
 const L=lib();
 const words=L.parseWordList('# header\n1\t學校\txuéxiào\tschool\tN\n1\t老師\tlǎoshī\tteacher\tN\n1\t的\tde\tof\tPtc\n2\t經驗\tjīngyàn\texperience\tN\n1\t你/妳\tnǐ\tyou\tN');
 assert.equal(words.length,5);assert.equal(Array.from(words[4].forms).join(),'你,妳');
 assert.equal(L.isTestable(words[2]),false,'particles are not asked');
 const random=seeded(3);
 const picks=new Set();for(let i=0;i<30;i++)picks.add(L.pickWord(words,1,new Set(['學校']),new Set(),random).forms[0]);
 assert.ok(!picks.has('學校')&&!picks.has('的')&&!picks.has('經驗'));
 let studied=0;for(let i=0;i<200;i++)if(L.pickWord(words,1,new Set(),new Set(['學校','老師']),random).forms[0]!=='你')studied++;
 assert.ok(studied>30&&studied<90,`studied picks ${studied}`);
 assert.equal(L.pickWord(words,3,new Set(),new Set(),random),null);
});

test('passage profiling flags words above the level',()=>{
 const L=lib();
 const words=L.parseWordList('0\t我\twǒ\tI\tN\n0\t喜歡\txǐhuān\tlike\tV\n0\t茶\tchá\ttea\tN\n4\t品嚐\tpǐncháng\tto taste\tV');
 const map=L.levelMap(words);
 assert.equal(L.profilePassage('我喜歡茶。',map,0).share,0);
 const hard=L.profilePassage('我品嚐茶。',map,0);
 assert.equal(hard.above,1);assert.ok(hard.share>L.MAX_ABOVE_SHARE);
 assert.equal(L.profilePassage('我品嚐茶。',map,4).above,0);
 assert.deepEqual(Array.from(L.passageLevels({mean:2.4,sd:0.3,weights:[]})),[2,1,3]);
 assert.deepEqual(Array.from(L.passageLevels({mean:-0.6,sd:0.3,weights:[]})),[0,1]);
});

test('the TOCFL list builder keeps levels, variants and dictionary meanings',()=>{
 const csv='ID,Traditional,Simplified,Pinyin,POS,Variants\nL0-1001,我,我,wǒ,N,\nL0-1002,你/妳,你,nǐ,N,"[{""Traditional"": ""你"", ""Simplified"": ""你"", ""Pinyin"": ""nǐ""}, {""Traditional"": ""妳"", ""Simplified"": ""你"", ""Pinyin"": ""nǐ""}]"\nL3-0864,推,推,tuī,V,\n';
 assert.equal(parseCSV(csv).length,4);
 const cedict='# header\n我\t\twǒ\tI; me\n你\t\tnǐ\tyou\n推\t\ttuī\tto push\n推\t\ttuí\tsomething else\n';
 const lines=buildWordList(csv,cedict);
 assert.deepEqual(lines,['0\t我\twǒ\tI; me\tN','0\t你/妳\tnǐ\tyou\tN','3\t推\ttuī\tto push\tV']);
});

test('writing is a sentence through level 2 and a paragraph from level 3',()=>{
 const {isParagraphTask,writingTask,levelName}=lib();
 assert.equal(isParagraphTask(2),false);assert.equal(isParagraphTask(3),true);
 assert.ok(writingTask(9).prompt.includes('200'));
 assert.equal(levelName(0),'Novice');assert.equal(levelName(4),'Level 4');
});
