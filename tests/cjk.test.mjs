import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers.mjs';

test('only text containing Chinese characters is tagged for larger Chinese sizing',()=>{
 const {chineseLang}=harness().load('src/lib/cjk.ts');
 assert.equal(chineseLang('伴娘'),'zh-Hant');
 assert.equal(chineseLang('最佳男主角'),'zh-Hant');
 assert.equal(chineseLang('bàn niáng 伴娘'),'zh-Hant');
 assert.equal(chineseLang('bàn niáng bridesmaid'),undefined);
 assert.equal(chineseLang('Excuse me; sorry'),undefined);
 assert.equal(chineseLang(''),undefined);
});

test('written answers match on Chinese characters only and accept any listed form',()=>{
 const {writingMatches}=harness().load('src/lib/cjk.ts');
 assert.equal(writingMatches('棟','棟'),true);
 assert.equal(writingMatches(' 棟。','棟 (dòng)'),true);
 assert.equal(writingMatches('栋','棟／栋'),true);
 assert.equal(writingMatches('看到','看見、看到'),true);
 assert.equal(writingMatches('看見看到','看見、看到'),true);
 assert.equal(writingMatches('東','棟'),false);
 assert.equal(writingMatches('','棟'),false);
 assert.equal(writingMatches('dong','棟'),false);
 assert.equal(writingMatches('看','看見'),false);
});
