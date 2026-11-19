import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

test('reveal: seen lights come on quickly, new ones last and slowly, only the last few slow',()=>{
 const L=harness().load('src/lib/laneSeen.ts');
 const R=L.REVEAL;
 // 5 seen, 7 on now: quick to 5, a pause, then light 6 and 7 slowly
 const d=[...Array(8).keys()].map(s=>L.revealDelay(s,5,7,0));
 assert.equal(d[0],R.first); assert.ok(d[1]<=R.fastMax&&d[4]<=R.fastMax);
 assert.equal(d[5],R.pause); assert.equal(d[6],R.slow); assert.equal(d[7],null);
 // the done screen starts at the old count: a pause, then the new light
 assert.equal(L.revealDelay(3,3,4,3),R.pause); assert.equal(L.revealDelay(4,3,4,3),null);
 // a big test-out: only the last 3 new lights are slow
 assert.ok(L.revealDelay(10,2,20,0)<=R.fastMax); assert.equal(L.revealDelay(17,2,20,0),R.pause); assert.equal(L.revealDelay(18,2,20,0),R.slow);
});
