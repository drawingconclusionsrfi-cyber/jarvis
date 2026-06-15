/* ================================================================
   Ri Ri Add-ons (v2) — ONE file, self-wiring.
   Semantic memory + Knowledge Base search  +  Chrome Nano brain/fallback.
   100% free · on-device · no API keys.
   Setup = 1 <script> tag + 1 RiriAddons.install({...}) call. Done.
   ================================================================ */

/* ---------- tiny helpers ---------- */
function _hash(s){ let h=5381; s=String(s); for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0; return h.toString(36); }

/* ================================================================
   1) SEMANTIC ENGINE  (Transformers.js + IndexedDB)
   ================================================================ */
const RiriSemantic = (() => {
  const DB='riri-vectors', STORE='vectors',
        MODEL='Xenova/all-MiniLM-L6-v2',
        CDN='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
  let ext=null, loading=null, pipe=null;

  function db(){ return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);
    r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE,{keyPath:'id'});};
    r.onsuccess=e=>res(e.target.result); r.onerror=e=>rej(e.target.error);});}
  async function _put(rec){const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(rec);tx.oncomplete=()=>res(1);tx.onerror=e=>rej(e.target.error);});}
  async function _all(){const d=await db();return new Promise((res,rej)=>{const tx=d.transaction(STORE,'readonly');const q=tx.objectStore(STORE).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=e=>rej(e.target.error);});}
  async function remove(id){const d=await db();return new Promise(res=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(String(id));tx.oncomplete=()=>res(1);});}

  function _load(device,dtype){ return dtype?pipe('feature-extraction',MODEL,{device,dtype}):pipe('feature-extraction',MODEL,{device}); }
  async function init(onStatus){
    if(ext) return ext; if(loading) return loading;
    loading=(async()=>{
      onStatus&&onStatus('Loading embedding model…');
      if(!pipe){ const t=await import(CDN); pipe=t.pipeline; t.env.allowLocalModels=false; }
      const gpu=!!navigator.gpu;
      try{ ext=await _load(gpu?'webgpu':'wasm','q8'); }
      catch(e1){ try{ ext=await _load('wasm','q8'); }catch(e2){ ext=await _load('wasm'); } }
      onStatus&&onStatus('ready'); return ext;
    })(); return loading;
  }
  async function embed(text){ await init(); const o=await ext(String(text||'').slice(0,2000),{pooling:'mean',normalize:true}); return Array.from(o.data); }
  const cos=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};

  async function index(id,text,meta){ if(!text)return; const v=await embed(text); await _put({id:String(id),text:String(text).slice(0,500),vec:v,meta:meta||{},ts:Date.now()}); }
  async function search(q,topK=5,filter){ const qv=await embed(q);
    return (await _all()).filter(r=>!filter||filter(r)).map(r=>({id:r.id,text:r.text,meta:r.meta,score:cos(qv,r.vec)})).sort((a,b)=>b.score-a.score).slice(0,topK); }
  async function backfill(items,onP){ const have=new Set((await _all()).map(r=>r.id)); let n=0;
    for(const it of items){ if(!have.has(String(it.id))){ try{ await index(it.id,it.text,it.meta);}catch(e){} } onP&&onP(++n,items.length); } return n; }
  async function count(){ return (await _all()).length; }
  async function clear(){ for(const r of await _all()) await remove(r.id); }
  return {init,embed,index,search,backfill,count,clear,remove};
})();
window.RiriSemantic=RiriSemantic;

/* ================================================================
   2) NANO  (Chrome built-in AI — desktop only, safe null elsewhere)
   ================================================================ */
const RiriNano = (() => {
  const LM=self.LanguageModel||(self.ai&&self.ai.languageModel)||null;
  const SUM=self.Summarizer||(self.ai&&self.ai.summarizer)||null;
  const TRN=self.Translator||(self.ai&&self.ai.translator)||null;
  const REW=self.Rewriter||(self.ai&&self.ai.rewriter)||null;
  const PRF=self.Proofreader||(self.ai&&self.ai.proofreader)||null;
  async function ok(a){ if(!a||!a.availability)return false; try{const s=await a.availability();return s==='available'||s==='downloadable'||s==='downloading';}catch{return false;} }
  const kill=s=>{try{s&&s.destroy&&s.destroy();}catch{}};
  async function available(){ return await ok(LM); }
  async function ask(p,sys){ if(!(await ok(LM)))return null; let s; try{ s=await LM.create(sys?{initialPrompts:[{role:'system',content:sys}]}:{}); return await s.prompt(String(p||'')); }catch{return null;}finally{kill(s);} }
  async function askJSON(p,schema,sys){ if(!(await ok(LM)))return null; let s; try{ s=await LM.create(sys?{initialPrompts:[{role:'system',content:sys}]}:{}); const r=await s.prompt(String(p||''),schema?{responseConstraint:schema}:{}); try{return JSON.parse(r);}catch{return r;} }catch{return null;}finally{kill(s);} }
  async function summarize(t,type='tldr'){ if(!(await ok(SUM)))return null; let s; try{ s=await SUM.create({type,format:'plain-text',length:'short'}); return await s.summarize(String(t||'')); }catch{return null;}finally{kill(s);} }
  async function translate(t,target='es',source='en'){ if(!(await ok(TRN)))return null; let s; try{ s=await TRN.create({sourceLanguage:source,targetLanguage:target}); return await s.translate(String(t||'')); }catch{return null;}finally{kill(s);} }
  async function rewrite(t,tone='as-is'){ if(!(await ok(REW)))return null; let s; try{ s=await REW.create({tone,format:'plain-text'}); return await s.rewrite(String(t||'')); }catch{return null;}finally{kill(s);} }
  async function proofread(t){ if(!(await ok(PRF)))return null; let s; try{ s=await PRF.create(); const r=await s.proofread(String(t||'')); return r&&(r.correctedInput||r.corrected||r); }catch{return null;}finally{kill(s);} }
  return {available,ask,askJSON,summarize,translate,rewrite,proofread};
})();
window.RiriNano=RiriNano;

/* ================================================================
   3) AUTO-WIRE LAYER  — the easy button
   ================================================================ */
const RiriAddons = (() => {
  let cfg={}, bfTimer=null, watched=false;

  function norm(arr){ return (arr||[]).map(m=>{
      if(typeof m==='string') return {id:'mem_'+_hash(m), text:m, meta:{}};
      const text=m.text||m.content||m.value||m.message||m.note||'';
      return {id:String(m.id||m.key||('mem_'+_hash(text))), text, meta:m.meta||{}};
    }).filter(x=>x.text); }

  async function autoBackfill(){ if(!cfg.getMemory) return 0;
    try{ return await RiriSemantic.backfill(norm(cfg.getMemory())); }catch(e){ return 0; } }
  function queueBackfill(){ clearTimeout(bfTimer); bfTimer=setTimeout(autoBackfill,1500); }

  function watchKey(key){ if(watched) return; watched=true;
    const orig=localStorage.setItem.bind(localStorage);
    localStorage.setItem=function(k,v){ orig(k,v); if(k===key) queueBackfill(); }; }

  // upgraded brain: recall + (offline) Nano + your brain + Nano last resort
  async function ask(prompt, sys){
    let ctx='';
    try{ const hits=await RiriSemantic.search(prompt,5); ctx=hits.map(h=>h.text).join('\n'); }catch(e){}
    const full = ctx ? ('Relevant past context:\n'+ctx+'\n\nUser: '+prompt) : prompt;
    if(!navigator.onLine){ const r=await RiriNano.ask(full,sys); if(r) return r; }
    if(cfg.ask){ try{ const r=await cfg.ask(full,sys); if(r||r==='') return r; }catch(e){} }
    const r=await RiriNano.ask(full,sys); if(r) return r;
    return null;
  }

  // manual one-liners (optional)
  const recall   = async (q,k=5)=>{ try{ return (await RiriSemantic.search(q,k)).map(h=>h.text).join('\n'); }catch{ return ''; } };
  const remember = (text,id)=> RiriSemantic.index(id||('mem_'+_hash(text)), text);
  const indexKB  = (id,text)=> RiriSemantic.index('kb_'+id, text, {kb:true});

  function install(opts){
    cfg=opts||{};
    if(cfg.getMemory) queueBackfill();      // index existing memory now
    if(cfg.memoryKey) watchKey(cfg.memoryKey); // auto-index new saves
    return RiriAddons;
  }
  return { install, ask, recall, remember, indexKB, reindex:autoBackfill,
           semantic:RiriSemantic, nano:RiriNano };
})();
window.RiriAddons=RiriAddons;

/* ================================================================
   SETUP — paste ONCE in your main script, then you're done:

     RiriAddons.install({
       ask: yourExistingAIcallFunction,   // async (prompt, sys) => answer
       getMemory: () => yourMemoryArray,   // [] of strings or {id,text}
       memoryKey: 'riri_memory'            // your localStorage key (auto-index)
     });

   Then use RiriAddons.ask(...) wherever you currently call the AI:
     const reply = await RiriAddons.ask(userMessage);
   -> recall, backfill, and offline fallback all happen automatically.

   (Knowledge Base chunks, if you want them searchable:
     RiriAddons.indexKB(chunkId, chunkText);  )
   ================================================================ */
