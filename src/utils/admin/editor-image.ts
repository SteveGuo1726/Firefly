/** Safe Markdown image insertion used by the two independent CMS editors. */
export function markdownImage(alt: string,url: string): string {
 const target=new URL(url);
 if(!["https:","http:"].includes(target.protocol) || target.username || target.password){
  throw new Error("Image URL must use HTTP(S)");
 }
 const label=String(alt||"图片").replace(/[\r\n]+/g," ").replace(/\\/g,"\\\\").replace(/\[/g,"\\[").replace(/\]/g,"\\]");
 // Angle-bracket destinations allow parentheses in image file paths.
 const destination=target.toString().replace(/</g,"%3C").replace(/>/g,"%3E");
 return `![${label}](<${destination}>)`;
}
export function insertMarkdownAt(text:string,start:number,end:number,insertion:string):{value:string;caret:number}{
 const begin=Math.min(text.length,Math.max(0,Math.floor(start)));
 const finish=Math.min(text.length,Math.max(begin,Math.floor(end)));
 const prefix=text.slice(0,begin),suffix=text.slice(finish);
 const before=prefix && !prefix.endsWith("\n")?"\n":"";
 const after=suffix && !suffix.startsWith("\n")?"\n":"";
 const inserted=before+insertion+after;
 return {value:prefix+inserted+suffix,caret:prefix.length+inserted.length};
}
