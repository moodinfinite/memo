import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
// Optional runtime: npm install --no-save @electric-sql/pglite, or set PGLITE_MODULE.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const deck='33333333-3333-4333-8333-333333333333',card='44444444-4444-4444-8444-444444444444',newCard='55555555-5555-4555-8555-555555555555';
await db.exec(`create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create role authenticated; create role anon;
 grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;`);
for(const name of ['schema.sql','rpc.sql','schema-p3.sql','schema-srs.sql','schema-drafts.sql']) {
 const sql=(await fs.readFile(`supabase/${name}`,'utf8')).replace('create extension if not exists "pgcrypto";','');
 await db.exec(sql);
}
// Match the deployed database's older mode constraint and text-array columns.
await db.exec(`alter table session_drafts add constraint session_drafts_mode_check
 check(mode in ('flashcard','multiple_choice','typed','sentence'));
 alter table session_drafts alter column card_order type text[] using card_order::text[];
 alter table session_drafts alter column known_ids type text[] using known_ids::text[];
 alter table session_drafts alter column unknown_ids type text[] using unknown_ids::text[];`);
await db.exec(await fs.readFile('supabase/schema-saving.sql','utf8'));
await db.exec(await fs.readFile('supabase/schema-saving.sql','utf8')); // migration is rerunnable
await db.query('insert into auth.users(id) values ($1),($2)',[user,other]);
await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated; set role authenticated;`);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
const rows=[{id:card,term:'Original',definition:'Definition',position:0}];
const save=(title,cards=rows,create=false)=>db.query('select public.save_deck($1,$2,$3,$4,$5::jsonb,$6)',[deck,title,'',null,JSON.stringify(cards),create]);
await save('Original',rows,true);
await db.query('insert into card_srs(user_id,card_id,set_id,repetitions,interval) values($1,$2,$3,4,21)',[user,card,deck]);

test('atomic rename preserves IDs and mastery; migration can run twice',async()=>{
 await save('Renamed');const r=await db.query('select c.id,c.term,s.repetitions from cards c join card_srs s on s.card_id=c.id');
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].id,card);assert.equal(r.rows[0].repetitions,4);
});
test('invalid replacement rolls back title and card changes together',async()=>{
 await assert.rejects(save('Should roll back',[{...rows[0],term:'Modified'},{id:newCard,term:'',definition:'Invalid',position:1}]));
 const r=await db.query('select sets.title,cards.term from sets join cards on cards.set_id=sets.id');assert.equal(r.rows[0].title,'Renamed');assert.equal(r.rows[0].term,'Original');
 assert.equal((await db.query('select repetitions from card_srs')).rows[0].repetitions,4);
});
test('another user cannot modify a deck or claim its card IDs',async()=>{
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await assert.rejects(save('Stolen'));
 const otherDeck='66666666-6666-4666-8666-666666666666';
 await assert.rejects(db.query('select public.save_deck($1,$2,$3,$4,$5::jsonb,true)',[otherDeck,'Other','',null,JSON.stringify(rows)]));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);assert.equal((await db.query('select title from sets')).rows[0].title,'Renamed');
});
test('adding and removing a card preserves the unchanged card history',async()=>{
 await save('Two',[...rows,{id:newCard,term:'New',definition:'New definition',position:1}]);assert.equal((await db.query('select id from cards')).rows.length,2);
 await save('One');assert.equal((await db.query('select id from cards')).rows.length,1);assert.equal((await db.query('select repetitions from card_srs')).rows[0].repetitions,4);
});
test('new study modes and a Master Deck session can be saved idempotently',async()=>{
 const id='77777777-7777-4777-8777-777777777777';
 for(const mode of ['learn','sentence','flashcard'])await db.query(`insert into study_sessions(id,user_id,set_id,mode,total_cards) values($1,$2,null,$3,2) on conflict(id) do update set mode=excluded.mode`,[id,user,mode]);
 assert.equal((await db.query('select * from study_sessions')).rows.length,1);
});
test('Master Deck and Learn drafts accept recovery state and conflict keys',async()=>{
 for(const scope of ['__master__',deck])await db.query(`insert into session_drafts(user_id,set_id,scope_id,mode,card_order,state)
 values($1,$2,$3,'learn',array[$4::text],'{"learnBatchIdx":1}') on conflict(user_id,scope_id) do update set state=excluded.state`,[user,scope==='__master__'?null:deck,scope,card]);
 assert.equal((await db.query('select * from session_drafts')).rows.length,2);
});
test('older deployed clients can insert and update drafts without a scope ID',async()=>{
 await db.query('delete from session_drafts where set_id=$1',[deck]);
 for(const index of [1,2])await db.query(`insert into session_drafts(user_id,set_id,mode,card_order,current_index)
 values($1,$2,'flashcard',array[$3::text],$4) on conflict(user_id,set_id) do update set current_index=excluded.current_index`,[user,deck,card,index]);
 const r=await db.query('select scope_id,current_index from session_drafts where set_id=$1',[deck]);
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].scope_id,deck);assert.equal(r.rows[0].current_index,2);
});
test.after(()=>db.close());
