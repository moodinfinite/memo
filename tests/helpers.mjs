import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export class Storage {
  values = new Map();
  get length() { return this.values.size }
  key(i) { return [...this.values.keys()][i] ?? null }
  getItem(k) { return this.values.get(k) ?? null }
  setItem(k,v) { this.values.set(k,String(v)) }
  removeItem(k) { this.values.delete(k) }
}
export function harness(storage = new Storage()) {
  const calls = [], timers = new Map(), modules = new Map(); let timerId=0;
  const db = { error: null, rows: {}, authCallback: null, registrations: 0 };
  const supabase = {
    auth: {
      getSession: async () => ({data:{session:{user:{id:'user-a'},access_token:'test'}}}),
      signOut: async () => ({error:null}),
      onAuthStateChange: callback => { db.authCallback=callback; db.registrations++; return {data:{subscription:{unsubscribe(){}}}} },
    },
    rpc: (name, args) => { calls.push({rpc:name,args}); return Promise.resolve({error:db.error}) },
    from: table => {
      const call={table,op:'select',data:null,filters:{}};
      const chain={};
      for(const op of ['select','insert','upsert','delete','update','eq','gt','in','order','limit','single','maybeSingle','abortSignal']) {
        chain[op]=(...args)=>{ if(['insert','upsert','delete','update'].includes(op)){call.op=op;call.data=args[0]}
          if(op==='eq')call.filters[args[0]]=args[1];return chain };
      }
      chain.then=(resolve,reject)=>{calls.push(structuredClone(call));return Promise.resolve(db.handle?.(call) ?? {error:db.error,data:db.rows[table]??(table==='sets'?{id:'deck',cards:[]}:table==='session_drafts'?null:[])}).then(resolve,reject)};
      return chain;
    },
  };
  const sandbox=vm.createContext({ console, crypto, AbortController, localStorage:storage,
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),
    fetch:async()=>({ok:false,json:async()=>({error:'Service unavailable'})}) });
  const root=path.resolve('src');
  function load(file) {
    file=path.resolve(file); if(!path.extname(file))file+='.ts';
    if(file===path.join(root,'lib/supabase.ts'))return {supabase};
    if(modules.has(file))return modules.get(file).exports;
    const module={exports:{}};modules.set(file,module);
    const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
    const localRequire=id=>id.startsWith('@/')?load(path.join(root,id.slice(2))):id.startsWith('.')?load(path.resolve(path.dirname(file),id)):require(id);
    vm.runInContext(`(function(require,module,exports){${output}\n})`,sandbox,{filename:file})(localRequire,module,module.exports);
    return module.exports;
  }
  const auth=load('src/store/authStore.ts').useAuthStore;
  const study=load('src/store/studyStore.ts').useStudyStore;
  const sets=load('src/store/setsStore.ts').useSetsStore;
  const srs=load('src/store/srsStore.ts').useSRSStore;
  const sync=load('src/lib/sync.ts');
  auth.setState({user:{id:'user-a'}});sync.activateSync('user-a');
  const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve()};
  return { auth,study,sets,srs,sync,storage,calls,db,load,settle,
    runTimers:async ms=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);await t.fn()}await settle()},
  };
}
export const cards=Array.from({length:10},(_,i)=>({id:`card-${i}`,set_id:'deck',user_id:'user-a',term:`term-${i}`,definition:`definition-${i}`,position:i}));
