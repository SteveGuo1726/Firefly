/** UI hints only; the JSON document remains the source of truth. */
export type NumberPresentation={unit:string;min?:number;max?:number;step:number;slider:boolean;help?:string};
const exact:Record<string,NumberPresentation>={
 'siteConfig.themeColor.hue':{unit:'°',min:0,max:360,step:1,slider:true,help:'拖动挑选网站主题色。'},
 'siteConfig.pageWidth':{unit:'rem',min:45,max:160,step:1,slider:true,help:'博客主体宽度。桌面一般设置为 70–110 rem。'},
 'siteConfig.imageOptimization.quality':{unit:'%',min:1,max:100,step:1,slider:true,help:'画质越高，图片文件通常越大。'},
 'backgroundWallpaper.common.dimOpacity':{unit:'',min:0,max:1,step:0.01,slider:true,help:'0 不遮暗，1 完全遮暗。'},
 'backgroundWallpaper.overlay.opacity':{unit:'',min:0,max:1,step:0.01,slider:true,help:'0 完全透明，1 完全不透明。'},
 'backgroundWallpaper.overlay.cardOpacity':{unit:'',min:0,max:1,step:0.01,slider:true},
 'analyticsConfig.umamiAnalytics.replays.sampleRate':{unit:'',min:0,max:1,step:0.01,slider:true,help:'0 不采样，1 全部采样。'},
 'musicPlayerConfig.volume':{unit:'',min:0,max:1,step:0.05,slider:true,help:'0 静音，1 最大音量。'},
 'sidebarLayoutConfig.noSidebarContentWidth':{unit:'',min:0.3,max:1,step:0.05,slider:true},
 'sakuraConfig.opacity.min':{unit:'',min:0,max:1,step:0.05,slider:true},
 'sakuraConfig.opacity.max':{unit:'',min:0,max:1,step:0.05,slider:true},
 'sakuraConfig.sakuraNum':{unit:'朵',min:0,max:120,step:1,slider:true,help:'樱花太多可能影响低性能设备。'},
 'backgroundWallpaper.banner.navbar.blur':{unit:'px',min:0,max:30,step:1,slider:true},
 'backgroundWallpaper.fullscreen.navbar.blur':{unit:'px',min:0,max:30,step:1,slider:true},
 'backgroundWallpaper.overlay.blur':{unit:'px',min:0,max:30,step:1,slider:true},
 'backgroundWallpaper.common.homeText.typewriter.speed':{unit:'毫秒',min:10,max:600,step:10,slider:false},
 'backgroundWallpaper.common.homeText.typewriter.deleteSpeed':{unit:'毫秒',min:10,max:600,step:10,slider:false},
 'backgroundWallpaper.common.homeText.typewriter.pauseTime':{unit:'毫秒',min:0,max:20000,step:100,slider:false},
 'backgroundWallpaper.common.carousel.interval':{unit:'毫秒',min:500,max:30000,step:500,slider:false},
 'friendCircleConfig.cacheSeconds':{unit:'秒',min:60,max:86400,step:60,slider:false},
 'friendCircleConfig.requestTimeout':{unit:'毫秒',min:1000,max:60000,step:1000,slider:false},
 'analyticsConfig.umamiAnalytics.replays.maxDuration':{unit:'毫秒',min:1000,max:3600000,step:1000,slider:false},
 'siteConfig.post.outdatedThreshold':{unit:'天',min:0,max:3650,step:1,slider:false},
 'sakuraConfig.limitTimes':{unit:'次',min:-1,max:1000,step:1,slider:false,help:'-1 表示不限制。'}
};
export function numberPresentation(section:string,path:string[],value:number):NumberPresentation{
 const full=[section,...path].join('.');
 if(exact[full])return exact[full];
 const key=path.at(-1)||'';
 if(/opacity|volume|sampleRate/i.test(key))return {unit:'',min:0,max:1,step:0.01,slider:true};
 if(/width|height|threshold|size|blur/i.test(key)){
  if(!Number.isInteger(value))return {unit:'',step:0.05,slider:false};
  return {unit:'',min:0,step:1,slider:false};
 }
 if(/page|count|limit|lines|posts|items|tags/i.test(key))return {unit:'',min:0,step:1,slider:false};
 return {unit:'',step:Number.isInteger(value)?1:0.01,slider:false};
}
export function percentageText(meta:NumberPresentation,value:number):string{
 if(meta.min===0&&meta.max===1)return Math.round(value*100)+'%';
 return meta.unit?String(value)+' '+meta.unit:String(value);
}
