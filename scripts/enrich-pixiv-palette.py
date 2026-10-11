"""KIRA V6: derive visual color metadata from remote Pixiv thumbnail previews.
No image bytes are committed; only lightweight derived color values. Free GitHub runner.
"""
import io, json, os, re, urllib.request, urllib.parse, colorsys
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),".."))
SRC=os.path.join(ROOT,'pixiv','data','feed.json')
OUT=os.path.join(ROOT,'public','assets','pixiv-feed.json')
allowed={'i.pixiv.re','i.pixiv.cat','i.pximg.net','i-cf.pximg.net','i.pixiv.moe'}
def classify(pixel):
    r,g,b=[p/255 for p in pixel]
    h,s,v=colorsys.rgb_to_hsv(r,g,b)
    if s<0.16:
        if v>0.80:return '白',0.03
        if v<0.27:return '黑',0.05
        return '灰',0.01
    name=('红' if h<.045 or h>=.962 else
          '暖' if h<.115 else
          '金' if h<.18 else
          '绿' if h<.48 else
          '蓝' if h<.715 else
          '紫' if h<.86 else
          '粉')
    return name,s*max(.1,v)
def evaluate(item):
    u=item.get('thumbnail_url')
    try:
        parsed=urllib.parse.urlparse(u)
        if parsed.scheme!='https' or parsed.hostname not in allowed: raise ValueError('unknown_host')
        req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36'})
        with urllib.request.urlopen(req,timeout=12) as rsp:
            if not rsp.headers.get('content-type','').startswith('image/'):raise ValueError('nonimage')
            payload=rsp.read(900000)
        im=Image.open(io.BytesIO(payload));im.thumbnail((48,48));im=im.convert('RGB')
        pixels=list(im.getdata());bins={}
        for rgb in pixels:
            name,score=classify(rgb)
            b=bins.setdefault(name,{'sum':0.,'rgb':[0.,0.,0.],'weight':0.})
            b['sum']+=score
            if score>0:
                b['weight']+=score
                for c in range(3): b['rgb'][c]+=rgb[c]*score
        name=max(bins,key=lambda k:bins[k]['sum'])
        chosen=bins[name];weight=chosen['weight']
        if weight<.01:raise ValueError('too_little_color')
        values=[round(max(0,min(255,v/weight))) for v in chosen['rgb']]
        return (item['id'],name,'#'+''.join(f'{v:02x}' for v in values),None)
    except Exception as e:return (item['id'],None,None,str(e)[:110])
def main():
    with open(SRC) as f:snap=json.load(f)
    items={}
    for arr in snap['channels'].values():
        for x in arr:items.setdefault(x['id'],x)
    results={}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for future in as_completed([pool.submit(evaluate,v) for v in items.values()]):
            key,tone,hexval,error=future.result()
            results[key]={'dominant_tone':tone,'dominant_hex':hexval,'color_method':'thumbnail_hsv_v1' if tone else None}
            if error: print('WARN',key,error)
    success=sum(1 for x in results.values() if x['dominant_tone'])
    for arr in snap['channels'].values():
        for x in arr:
            if x['id'] in results:
                for key,val in results[x['id']].items():
                    if val is not None:x[key]=val
    # Avoid treating a failed attempt as successful measurement.
    if success<20:
        print('Low image coverage',success,'of',len(items),'not overwriting snapshots')
        raise SystemExit(2)
    for filename in [SRC,OUT]:
        with open(filename,'w') as f:json.dump(snap,f,ensure_ascii=False,indent=2)
    print('Enriched thumbnails',success,'/',len(items),'saved only color labels and hex metadata')
if __name__=='__main__':main()
