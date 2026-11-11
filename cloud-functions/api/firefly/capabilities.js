/**
 * Capability negotiation for the restored CMS UI.
 * Reports authentication and EdgeOne Blob storage capabilities.
 */
import {isAuthenticated} from '../../../src/server/auth.mjs';
export function onRequest({request,env={}}){
 if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
 const config={...process.env,...env};
 const authed=isAuthenticated(request,config);
 const writes=authed&&config.FIREFLY_ENABLE_WRITES!=='0';
 return Response.json({
   schema:'firefly-cms-capabilities-v1',
   authenticated:authed,
   storage:'edgeone-blob',
   reads:true,
   writes,
   revisions:true,
   reason:writes?'EdgeOne Blob storage active':authed?'Writes disabled by configuration':'Authentication required for writes'
 },{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
