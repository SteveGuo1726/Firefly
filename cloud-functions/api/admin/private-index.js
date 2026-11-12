/** Original OAuth-compatible private-index route; no GitHub tree requests. */
import {getAdminContentIndex} from '../admin-content-index.json.js';
export async function onRequest(context){
  const response=await getAdminContentIndex(context);
  if(!response.ok)return response;
  const data=await response.json();
  return Response.json({posts:data.posts,limited:false,source:'edgeone-cms'},{
   headers:{'cache-control':'private,no-store','x-content-type-options':'nosniff'}});
}
