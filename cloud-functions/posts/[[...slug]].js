import {createEdgeOneStore} from '../../src/server/edgeone-store.mjs';
import {resolvePublicPost} from '../../src/server/post-resolver.mjs';
import {renderLivePost} from '../../src/server/render-live-post.mjs';
export async function onRequest({request,params={},env={},store=null}){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const config={...process.env,...env};
 const slug=String(params.slug||new URL(request.url).pathname.split('/').filter(Boolean).at(-1)||'');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(slug))return new Response('Not found',{status:404});
 try {
   const {item}=await resolvePublicPost(store||await createEdgeOneStore({env:config}),slug);
   if(!item)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
   const html=renderLivePost(item,{twikooEnv:config.PUBLIC_TWIKOO_ENV_ID||''});
   return new Response(request.method==='HEAD'?null:html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Article temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}
}
