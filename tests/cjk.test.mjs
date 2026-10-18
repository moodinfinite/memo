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
