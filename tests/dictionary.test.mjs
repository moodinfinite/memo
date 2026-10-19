import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness} from './helpers.mjs';
import {markSyllable} from '../scripts/build-cedict.mjs';

const sample=['# header line','圖書館\t图书馆\ttú shū guǎn\tlibrary','我們\t我们\twǒ men\twe; us; ourselves','去\t\tqù\tto go','行\t\tháng\trow; line','行\t\txíng\tto walk; to go'].join('\n');
const words=parts=>Array.from(parts,p=>p.word);

test('CC-CEDICT tone numbers become tone marks',()=>{
 const cases={tu2:'tú',guan3:'guǎn',liu2:'liú',gui4:'guì',xiong1:'xiōng',er2:'ér','lu:4':'lǜ','nu:3':'nǚ',Bei3:'Běi',r5:'r',men5:'men',A:'A'};
 for(const [input,expected] of Object.entries(cases))assert.equal(markSyllable(input),expected,input);
});

test('a selection splits into the longest dictionary words, in traditional or simplified',()=>{
 const {parseDictionary,lookupText}=harness().load('src/lib/dictionary.ts');
 const dict=parseDictionary(sample);
 assert.deepEqual(words(lookupText(dict,'我們去圖書館。')),['我們','去','圖書館']);
 assert.deepEqual(words(lookupText(dict,'我们去图书馆')),['我们','去','图书馆']);
 assert.equal(lookupText(dict,'图书馆')[0].entries[0].pinyin,'tú shū guǎn');
 assert.equal(lookupText(dict,'行')[0].entries.length,2);
 const unknown=lookupText(dict,'去㐀');assert.equal(unknown[1].word,'㐀');assert.equal(unknown[1].entries.length,0);
 assert.equal(lookupText(dict,'hello!').length,0);
});

test('saved definitions use the first reading, and unknown words cannot be saved',()=>{
 const {parseDictionary,lookupText,cardDefinition}=harness().load('src/lib/dictionary.ts');
 const dict=parseDictionary(sample);
 assert.equal(cardDefinition(lookupText(dict,'圖書館')),'tú shū guǎn — library');
 assert.equal(cardDefinition(lookupText(dict,'我們去')),'wǒ men qù — we + to go');
 assert.equal(cardDefinition(lookupText(dict,'去㐀')),null);
 assert.equal(cardDefinition([]),null);
});

test('the bundled dictionary is complete, attributed and finds common words',()=>{
 const text=fs.readFileSync('public/cedict.txt','utf8');
 assert.match(text,/^# Derived from CC-CEDICT/);assert.match(text,/creativecommons\.org\/licenses\/by-sa\/4\.0/);
 const {parseDictionary,lookupText}=harness().load('src/lib/dictionary.ts');
 const dict=parseDictionary(text);
 assert.ok(dict.size>120000);
 for(const [word,pinyin] of [['圖書館','tú shū guǎn'],['伴娘','bàn niáng'],['咖啡','kā fēi'],['綠','lǜ'],['不好意思','bù hǎo yì si']])
  assert.equal(lookupText(dict,word)[0].entries[0].pinyin,pinyin,word);
});
