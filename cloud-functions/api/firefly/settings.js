import {createEdgeOneStore} from '../../../src/server/edgeone-store.mjs';
import {createSettingsService,publicSettings,defaultSettings} from '../../../src/server/settings.mjs';
import {isAuthenticated,sameOrigin} from '../../../src/server/auth.mjs';
export async function onRequest({request,env={},store=null}){
 const config={...process.env,...env};
 const admin=isAuthenticated(request,config);
 if(request.method==='PUT'&&!admin)return Response.json({error:'Unauthorized'},{status:401});
 try{
  const storage=store||await createEdgeOneStore({env:config});
  const service=createSettingsService(storage,{enableWrites:config.FIREFLY_ENABLE_WRITES!=='0'});
  if(request.method==='GET'){const s=await service.get();return Response.json(admin?(s||defaultSettings):publicSettings(s));}
  if(request.method!=='PUT')return Response.json({error:'Method not allowed'},{status:405});
  if(!admin)return Response.json({error:'Unauthorized'},{status:401});
  if(!sameOrigin(request)||request.headers.get('x-firefly-cms')!=='1')return Response.json({error:'Invalid origin'},{status:403});
  const data=await request.json();return Response.json(await service.save(data.settings,data.expectedRevision));
 }catch(e){return Response.json({error:e?.status?e.message:'Settings backend unavailable'},{status:e?.status||503})}
}
