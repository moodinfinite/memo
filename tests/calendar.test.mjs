import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers.mjs';

test('week uses seven local dates Monday through Sunday across month and year boundaries',()=>{
 const {calendarDays,calendarDayKey}=harness().load('src/lib/calendar.ts');
 const days=calendarDays(new Date(2027,0,1,23),'week');
 assert.equal(days.length,7);assert.equal(days[0].getDay(),1);assert.equal(days[6].getDay(),0);
 assert.equal(calendarDayKey(days[0]),'2026-12-28');assert.equal(calendarDayKey(days[6]),'2027-01-03');
 const sunday=calendarDays(new Date(2027,0,3),'week');assert.equal(calendarDayKey(sunday[0]),'2026-12-28');
 const monday=calendarDays(new Date(2027,0,4),'week');assert.equal(calendarDayKey(monday[0]),'2027-01-04');
});

test('month handles leap years and Monday alignment without shifting the first day',()=>{
 const {calendarDays,calendarDayKey}=harness().load('src/lib/calendar.ts');
 const leap=calendarDays(new Date(2028,1,15),'month');
 assert.equal(leap[0],null);assert.equal(calendarDayKey(leap[1]),'2028-02-01');
 assert.equal(leap.filter(Boolean).length,29);assert.equal(calendarDayKey(leap.at(-1)),'2028-02-29');
 assert.equal(calendarDays(new Date(2027,1,15),'month').filter(Boolean).length,28);
});

test('streak counts unique completed days, preserves yesterday, expires after a missed day, and ignores future dates',()=>{
 const {calendarStreak}=harness().load('src/lib/calendar.ts');
 const history=['2026-12-30','2026-12-31','2026-12-31','2027-01-01','2027-02-01'];
 assert.equal(calendarStreak(history,new Date(2027,0,1)),3);
 assert.equal(calendarStreak(history,new Date(2027,0,2)),3);
 assert.equal(calendarStreak(history,new Date(2027,0,3)),0);
 assert.equal(calendarStreak([],new Date(2027,0,1)),0);
});

test('week and streak retain local calendar days through daylight saving changes',()=>{
 const previous=process.env.TZ;process.env.TZ='America/New_York';
 try {
  const {calendarDays,calendarDayKey,calendarStreak}=harness().load('src/lib/calendar.ts');
  const days=calendarDays(new Date(2026,2,8,23),'week');
  assert.equal(days.map(calendarDayKey).join(','),'2026-03-02,2026-03-03,2026-03-04,2026-03-05,2026-03-06,2026-03-07,2026-03-08');
  assert.equal(calendarStreak(['2026-03-07','2026-03-08','2026-03-09'],new Date(2026,2,9)),3);
 } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
});
