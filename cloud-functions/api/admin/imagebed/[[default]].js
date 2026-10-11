import {proxyGalleryManagement} from "../../../../src/server/admin-auth/gallery-proxy.js";
export default async function onRequest(context){
 return proxyGalleryManagement(context.request);
}
