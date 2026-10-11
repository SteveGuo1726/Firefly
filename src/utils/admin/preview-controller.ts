/**
 * Bounded latest-wins preview scheduler.
 *
 * Separates reading an article from rendering the relatively heavy MDX,
 * Mermaid and code-highlighting dependencies on the browser's main thread.
 * Keeps only four recent short documents/HTML results in memory.
 */
export type PreviewDocument = { source: string; isMdx?: boolean };
export type PreviewCallbacks = {
 onReady: (html: string) => void;
 onBusy: () => void;
 onFailure: (message: string) => void;
};
type Timer = ReturnType<typeof setTimeout>;
const MAX_DOCUMENT_CHARS=100_000;
const MAX_HTML_CHARS=300_000;
const CACHE_ENTRIES=4;

export function createPreviewController(
 render: (document: PreviewDocument) => Promise<string>,
 callbacks: PreviewCallbacks,
 delayMs=320,
) {
 let generation=0;
 let timer: Timer|null=null;
 const cache=new Map<string,string>();
 const inflight=new Map<string,Promise<string>>();

 const keyOf=(document:PreviewDocument) => JSON.stringify([Boolean(document.isMdx),document.source]);
 function getCached(key:string):string|undefined {
  if(!cache.has(key))return undefined;
  const html=cache.get(key)!;
  cache.delete(key);
  cache.set(key,html);
  return html;
 }
 function store(key:string,document:PreviewDocument,html:string){
  if(document.source.length>MAX_DOCUMENT_CHARS || html.length>MAX_HTML_CHARS)return;
  cache.delete(key);
  cache.set(key,html);
  while(cache.size>CACHE_ENTRIES)cache.delete(cache.keys().next().value!);
 }
 async function calculate(key:string,document:PreviewDocument):Promise<string>{
  const cached=getCached(key);
  if(cached!==undefined)return cached;
  let existing=inflight.get(key);
  if(!existing){
   existing=Promise.resolve().then(()=>render(document));
   inflight.set(key,existing);
  }
  try {
   const html=await existing;
   store(key,document,html);
   return html;
  } finally {
   if(inflight.get(key)===existing)inflight.delete(key);
  }
 }
 function cancel(){
  ++generation;
  if(timer!==null)clearTimeout(timer);
  timer=null;
 }
 function schedule(document:PreviewDocument,immediate=false){
  cancel();
  const current=generation;
  const key=keyOf(document);
  const cached=getCached(key);
  if(cached!==undefined){
   callbacks.onReady(cached);
   return;
  }
  callbacks.onBusy();
  timer=setTimeout(()=>{
   timer=null;
   void calculate(key,document).then(
    html=>{if(generation===current)callbacks.onReady(html);},
    error=>{if(generation===current)callbacks.onFailure(error instanceof Error?error.message:"预览渲染失败。");},
   );
  },immediate?0:delayMs);
 }
 async function renderNow(document:PreviewDocument):Promise<string>{
  return calculate(keyOf(document),document);
 }
 function clear(){
  cancel();
  cache.clear();
 }
 return {schedule,renderNow,cancel,clear};
}
