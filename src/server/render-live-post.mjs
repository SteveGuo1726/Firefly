const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeParagraph(body){
  return esc(body)
    .replace(/^### (.*)$/gm,'<h3>$1</h3>')
    .replace(/^## (.*)$/gm,'<h2>$1</h2>')
    .replace(/^# (.*)$/gm,'<h1>$1</h1>')
    .replace(/^> (.*)$/gm,'<blockquote>$1</blockquote>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/g,'<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');
}
export function renderLivePost(item,{twikooEnv='' }={}){
 if(!item||item.state!=='published')throw Error('Only published items are renderable');
 const f=item.fields||{};if(f.hidden||f.private||f.draft||f.password||f.passwordHash||f.protected)throw Error('Protected content is not renderable');
 const id=encodeURIComponent(item.id);const title=esc(item.title||item.id);const description=esc(f.description||'星穹漫遐，蝶携清梦。');
 const canon='https://blog.casto.top/posts/'+id+'/';
 const published=esc(item.publishedAt||item.createdAt||'');const updated=esc(item.updatedAt||'');
 const comments=twikooEnv&&f.comment!==false?`<section class="card"><h2>评论</h2><div id="tcomment"></div><script src="https://registry.npmmirror.com/twikoo/1.7.14/files/dist/twikoo.min.js" onload="window.twikoo&&twikoo.init({envId:${JSON.stringify(twikooEnv)},el:'#tcomment',path:${JSON.stringify('/posts/'+item.id+'/')},lang:'zh-CN'})"></script></section>`:'';
 return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} - 星遐蝶梦</title><meta name="description" content="${description}"><link rel="canonical" href="${canon}"><style>:root{color-scheme:light dark}body{margin:0;font:16px/1.7 system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#f7f5fb;color:#2b2733}nav{padding:14px 24px;background:#fff;border-bottom:1px solid #e6e1ef}nav a{color:#6a4f9a;text-decoration:none}main.card{max-width:820px;margin:32px auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(80,60,120,.08)}h1{font-size:2rem;line-height:1.3}h2,h3{margin-top:1.6em}.body img{max-width:100%;height:auto;border-radius:8px}.body blockquote{border-left:4px solid #ae8ad0;margin:1.2em 0;padding:8px 16px;background:#f0e9f8}.body code{background:#eee8f5;padding:2px 6px;border-radius:4px;font-family:monospace}footer{text-align:center;color:#8a8497;padding:32px}@media(prefers-color-scheme:dark){body{background:#17151e;color:#e8e3f0}nav,main.card{background:#211e2a;border-color:#332e40}nav a{color:#c8a6e8}.body blockquote{background:#2d2638;border-color:#8360a8}.body code{background:#2d2638}}</style><meta property="og:type" content="article"><meta property="og:title" content="${title}"></head><body><nav><a href="/">✦ 星遐蝶梦</a> · <a href="/archive/">归档</a> · <a href="/dynamic/">动态</a> · <a href="/gallery/">相册</a></nav><main class="card"><h1>${title}</h1><small>发布时间 ${published} · 最近更新 ${updated}</small><article class="body"><p>${safeParagraph(item.body)}</p></article></main>${comments}<footer>© 星遐蝶梦</footer></body></html>`;
}
