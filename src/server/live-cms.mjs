/**
 * Firefly CMS: storage-agnostic, revisioned content management on EdgeOne.
 * Optimistic concurrency control via expectedRev + immutable revision keys.
 * Backed by EdgeOne Blob strong consistency storage.
 */
import { randomUUID } from 'node:crypto';
const VALID_KIND = new Set(['posts', 'dynamic']);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;

export class CmsError extends Error {
  constructor(status, message) { super(message); this.name='CmsError'; this.status=status; }
}
function assertKind(kind) {
  if (!VALID_KIND.has(kind)) throw new CmsError(400, 'Invalid content kind');
  return kind;
}
function assertId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new CmsError(400, 'Invalid content identifier');
  return id;
}
function cleanBody(body) {
  if (typeof body !== 'string' || body.length > 2_000_000) throw new CmsError(400, 'Invalid article body');
  return body;
}
function cleanInput(input, before) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CmsError(400, 'Invalid article');
  const state = input.state ?? before?.state ?? 'draft';
  if (!['draft','published','private','deleted'].includes(state)) throw new CmsError(400,'Invalid visibility');
  const title = input.title ?? before?.title ?? '';
  if (typeof title !== 'string' || title.length > 500) throw new CmsError(400,'Invalid title');
  const fields = input.fields ?? before?.fields ?? {};
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) throw new CmsError(400,'Invalid frontmatter');
  if (JSON.stringify(fields).length > 50_000) throw new CmsError(413,'Frontmatter too large');
  return {
    title,
    body: cleanBody(input.body ?? before?.body ?? ''),
    state,
    fields,
    publishedAt: input.publishedAt ?? before?.publishedAt ?? null,
    createdAt: before?.createdAt ?? new Date().toISOString(),
  };
}
function isPublic(item) {
  if (!item || item.state !== 'published') return false;
  const f = item.fields ?? {};
  return !(f.password || f.passwordHash || f.encrypted || f.isPrivate ||
    f.private === true || f.hidden === true || f.draft === true ||
    f.protected === true);
}
export function publicContentItem(item){
 const summary=publicSummary(item);
 if(!summary)return null;
 return {...summary,state:'published',body:item.body,createdAt:item.createdAt};
}
export function publicSummary(item) {
  if (!isPublic(item)) return null;
  const f=item.fields ?? {};
  const safe={};
  for (const key of ['category','tags','cover','description','slug','lang','pinned','comment','author']) {
    if (Object.hasOwn(f,key)) safe[key]=structuredClone(f[key]);
  }
  return {kind:item.kind,id:item.id,rev:item.rev,title:item.title,
    publishedAt:item.publishedAt,updatedAt:item.updatedAt,fields:safe};
}
function isValidDate(date) { const d = Date.parse(date || ''); return Number.isFinite(d) ? d : null; }
const pointerKey = (kind,id)=>`firefly/cms/ptr/${kind}/${id}.json`;
const revisionKey = (kind,id,rev)=>`firefly/cms/revisions/${kind}/${id}/${rev}.json`;
const indexKey = kind => `firefly/cms/index/${kind}.json`;

export function createCms(store, { enableWrites=false, clock=()=>new Date(), idGenerator=randomUUID }={}) {
  if (!store || typeof store.getJSON!=='function' || typeof store.setJSON!=='function') {
    throw new TypeError('Store must implement getJSON/setJSON');
  }
  const locks = new Map();
  async function serialized(key, job) {
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const next = new Promise(resolve => release=resolve);
    locks.set(key, next);
    await previous;
    try { return await job(); }
    finally { release(); if (locks.get(key)===next) locks.delete(key); }
  }
  function assertWritable() {
    if (!enableWrites) throw new CmsError(503,'Writes disabled pending EdgeOne storage configuration');
  }
  async function load(kind,id) {
    assertKind(kind); assertId(id);
    const pointer = await store.getJSON(pointerKey(kind,id));
    if (!pointer) return null;
    if (!ID.test(pointer.rev)) throw new CmsError(500,'Corrupt content pointer');
    const item = await store.getJSON(revisionKey(kind,id,pointer.rev));
    if (!item) throw new CmsError(500,'Missing content revision');
    return { ...item, kind, id, rev: pointer.rev };
  }
  async function publicItem(kind,id) {
    const item=await load(kind,id);
    return isPublic(item) ? item : null;
  }
  async function indexIds(kind) {
    assertKind(kind);
    const v=await store.getJSON(indexKey(kind));
    return Array.isArray(v?.ids) ? v.ids.filter(id=>typeof id==='string'&&ID.test(id)) : [];
  }
  async function list(kind,{publicOnly=true}={}) {
    const ids=await indexIds(kind);
    const entries=await Promise.all([...new Set(ids)].map(id=>load(kind,id)));
    return entries.filter(item=>item && (!publicOnly || isPublic(item)))
      .sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||0)-Date.parse(a.updatedAt||a.createdAt||0));
  }
  async function commit(kind,id,input,{expectedRev=null,mode='update'}={}) {
    assertWritable();assertKind(kind);assertId(id);
    if (expectedRev !== null && expectedRev !== '' && (typeof expectedRev!=='string'||!ID.test(expectedRev))) throw new CmsError(400,'Invalid revision');
    return serialized(`${kind}/${id}`, async()=>{
      const old=await load(kind,id);
      if (mode==='create' && old) throw new CmsError(409,'Article already exists');
      if (mode!=='create' && mode!=='upsert' && !old) throw new CmsError(404,'Article does not exist');
      if (old && expectedRev && expectedRev!==old.rev) throw new CmsError(409,'Revision conflict');
      const clean=cleanInput(input,old);
      const now=clock().toISOString();
      const rev=idGenerator().replaceAll('-','');
      assertId(rev);
      const next={...clean,createdAt:old?.createdAt||now,updatedAt:now,
        publishedAt:clean.state==='published'?(clean.publishedAt||now):clean.publishedAt,
        revision:rev, parentRevision:old?.rev||null};
      // Store unique immutable revision before changing public pointer.
      await store.setJSON(revisionKey(kind,id,rev), next);
      await store.setJSON(pointerKey(kind,id), {rev,updatedAt:now});
      await serialized(`index/${kind}`,async()=>{
        const ids=await indexIds(kind);
        if (!ids.includes(id)) await store.setJSON(indexKey(kind), {ids:[...ids,id],updatedAt:now});
      });
      return { ...next,kind,id,rev };
    });
  }
  async function tombstone(kind,id,{expectedRev=null}={}) {
    const old=await load(kind,id);
    if (!old) throw new CmsError(404,'Not found');
    return commit(kind,id,{state:'deleted'},{expectedRev,mode:'update'});
  }
  async function restore(kind,id,fromRev,{expectedRev=null}={}) {
    assertId(fromRev);
    const item=await store.getJSON(revisionKey(assertKind(kind),assertId(id),fromRev));
    if (!item) throw new CmsError(404,'Revision not found');
    return commit(kind,id,{title:item.title,body:item.body,state:item.state,
      fields:item.fields,publishedAt:item.publishedAt},{expectedRev,mode:'update'});
  }
  async function history(kind,id,{max=100}={}) {
    let item=await load(kind,id);
    const out=[];
    while(item && out.length<max){
      out.push({rev:item.rev,parentRevision:item.parentRevision,state:item.state,updatedAt:item.updatedAt,title:item.title});
      if(!item.parentRevision) break;
      const previous=await store.getJSON(revisionKey(kind,id,item.parentRevision));
      item=previous?{...previous,rev:item.parentRevision}:null;
    }
    return out;
  }
  async function lastActivity() {
    const items=[...(await list('posts')),...(await list('dynamic'))];
    const now=clock().getTime();
    const timestamps=items.flatMap(item=>[isValidDate(item.updatedAt),isValidDate(item.publishedAt)])
      .filter(x=>x!==null&&x<=now);
    return timestamps.length?new Date(Math.max(...timestamps)).toISOString():null;
  }
  return {load, publicItem, list, commit, tombstone, restore, history, lastActivity,
    keys:{pointerKey,revisionKey,indexKey}};
}

export function createMemoryStore(initial={}) {
  const data=new Map(Object.entries(initial));
  const clone=v=>v === undefined?undefined:structuredClone(v);
  return {getJSON:async key=>clone(data.get(key)??null),setJSON:async(key,val)=>{data.set(key,clone(val))},snapshot:()=>Object.fromEntries(data)};
}
