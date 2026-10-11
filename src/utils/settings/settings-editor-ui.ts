/** Chinese-language descriptors for Firefly's centralized, build-time settings. */
export const sectionCategories = [
 {title:'站点基础',description:'博客名称、个人信息和对外展示',sections:['siteConfig','profileConfig','announcementConfig','licenseConfig']},
 {title:'外观布局',description:'壁纸、封面、侧边栏和视觉效果',sections:['backgroundWallpaper','displaySettingsConfig','coverImageConfig','sidebarLayoutConfig','sakuraConfig']},
 {title:'内容与组件',description:'动态内容、代码展示和图表',sections:['dynamicConfig','mermaidConfig','plantumlConfig','expressiveCodeConfig']},
 {title:'访问统计',description:'网站分析与访客统计',sections:['analyticsConfig']},
] as const;

/** The labels deliberately do not expose implementation field identifiers. */
export const fieldNames:Record<string,string>={
 Id:'标识编号',ad:'广告设置',all:'全部',alt:'图片说明',apiUrl:'接口地址',apis:'备用接口',autoTrack:'自动记录事件',avatar:'头像图片',bangumi:'番组页面',banner:'顶部横幅',bannerCarouselSwitchable:'允许切换横幅轮播',bannerTitleSwitchable:'允许切换横幅标题',bilibili:'视频主页',bio:'个人简介',blockSelector:'页面元素选择器',blur:'模糊程度',blurRamp:'渐进模糊',booknav:'书签导航页',border:'边框与阴影',calendar:'日历组件',card:'卡片外观',cardBorderSwitchable:'允许切换卡片边框',cardFollowThemeSwitchable:'允许切换卡片配色',cardOpacity:'卡片透明度',carousel:'壁纸轮播',categoryBar:'显示分类导航条',categoryOrder:'内容类别排序',categoryStyle:'分类标签样式',ck:'访问统计标识',closable:'允许关闭公告',collapseThreshold:'自动折叠宽度',collectWebVitals:'采集页面性能',color:'颜色',columnWidth:'列表列宽',common:'通用参数',content:'正文内容',contentMode:'内容显示模式',coverFullWidth:'封面铺满卡片',coverPosition:'封面位置',darkTheme:'深色主题',defaultCollapsed:'默认折叠',defaultMode:'默认模式',defaultOn:'默认开启',deleteSpeed:'淡出速度',description:'内容描述',descriptionLines:'摘要显示行数',desktop:'电脑端',dimOpacity:'暗色遮罩透明度',displayCount:'显示数量',dynamic:'动态页面',enable:'启用',enableInPost:'在文章中显示封面',enableInPostOverlay:'文章封面叠加效果',enablePythonMarkdownAdmonitions:'兼容提示块语法',enabled:'已启用',excludedLangs:'不显示的语言',external:'打开外部链接',fadeSpeed:'渐变速度',favicon:'浏览器标签页图标',feed:'订阅源',foldArticle:'折叠文章内容',followTheme:'跟随主题色',formats:'图片输出格式',friends:'友情链接页',fullscreen:'全屏壁纸',fullscreenLayoutSwitchable:'允许切换全屏布局',gallery:'相册页面',generateOgImages:'生成分享图片',googleAnalyticsId:'谷歌统计编号',gradient:'背景渐变',gradientSwitchable:'允许切换渐变',grid:'网格布局',guestbook:'留言板页面',hashMode:'兼容井号路由',height:'高度',hideOnNonPostPage:'在非文章页隐藏',hideSidebarOnPostPage:'在文章页隐藏侧边栏',homeText:'首页文字',horizontal:'水平位置',hue:'主题颜色色相',icon:'图标',image:'图片',imageOptimization:'图片优化',immersiveReading:'沉浸阅读',interval:'轮播间隔',itemsPerPage:'每页显示数量',keywords:'搜索关键词',la51Analytics:'51 统计',lang:'网站语言',layout:'布局方式',layoutSwitchable:'允许切换列表布局',leftComponents:'左侧组件',lightTheme:'浅色主题',limit:'显示上限',limitTimes:'动画次数限制',lineThreshold:'折叠行数',link:'相关链接',links:'链接列表',linksEnable:'启用链接',logo:'站点标志',mal:'动画收藏页',maskLevel:'遮罩强度',masonry:'瀑布流布局',max:'最大值',maxDuration:'最长时间',memos:'动态同步服务',menuAlign:'导航菜单对齐',meta:'文章元信息',microsoftClarityId:'微软行为统计编号',min:'最小值',mobile:'手机端',mobileBottomComponents:'手机底部组件',mobileDefaultMode:'手机默认布局',mode:'展示模式',name:'名称',navbar:'顶部导航栏',navbarMode:'导航栏滚动方式',noReferrerDomains:'不发送来源信息的图片域名',noSidebarContentWidth:'无侧边栏时的内容宽度',opacity:'透明度',outdatedThreshold:'文章过期提示天数',overlay:'透明覆盖层',overlaySwitchable:'允许切换覆盖层参数',padding:'内边距',pageWidth:'网站内容宽度',pages:'页面入口',pagination:'分页设置',parent:'上级内容编号',pauseTime:'暂停时间',playerEnable:'启用背景播放器',playerMode:'播放器模式',playerUrl:'播放器地址',pluginCollapsible:'代码块折叠',pluginLanguageBadge:'显示代码语言标签',pluginLanguageLogo:'显示语言图标',position:'显示位置',post:'文章阅读',postInfo:'文章信息',postListLayout:'文章列表布局',postNavigation:'显示上下篇导航',postsPerPage:'每页文章数量',previewLines:'代码预览行数',profileUrl:'个人资料链接',projects:'项目页面',quality:'图片压缩质量',randomCoverImage:'随机封面设置',randomPosts:'推荐随机文章',rehypeCallouts:'文章提示框',relatedPosts:'推荐相关文章',replays:'访客行为回放',replaysScriptUrl:'回放脚本地址',rightComponents:'右侧组件',rotation:'旋转角度',sakuraNum:'樱花数量',sakuraSwitchable:'允许切换樱花动画',sampleRate:'采样比例',screenRecord:'页面行为录制',scriptUrl:'脚本地址',sdkUrl:'统计脚本地址',server:'渲染服务地址',share:'显示分享按钮',showCategory:'显示文章分类',showComment:'显示评论区',showHeatmap:'显示日历热力图',showLastModified:'显示最近修改时间',showLoading:'显示图片加载占位',showName:'显示链接名称',showOnPostPage:'在文章页显示',showPublished:'显示发布日期',showReadingTime:'显示阅读时间',showStatsIcons:'显示统计图标',showTags:'显示标签',showTitle:'显示标题',showWords:'显示字数',siteInfo:'站点信息',siteStartDate:'建站日期',site_url:'网站地址',size:'尺寸',specificConfig:'组件附加选项',speed:'运动速度',sponsor:'赞助页面',src:'图片地址',stats:'统计信息',subjectBaseUrl:'条目详情链接前缀',subtitle:'网站副标题',subtitleSize:'副标题字号',tabletSidebar:'平板侧边栏',tagCount:'显示标签数量',tagStyle:'标签样式',tagsBottomStyle:'底部标签样式',tagsPosition:'标签位置',text:'显示文字',theme:'主题风格',themeColor:'主题颜色',themeColorSwitchable:'允许切换主题色',timezone:'时区',title:'标题',titleSize:'标题字号',tocEnabled:'显示目录',tocPosition:'目录位置',trackOutboundLinks:'记录外链点击',transitionEffect:'切换过渡效果',transparentMode:'透明导航栏',type:'组件类型',typewriter:'打字机动画',uid:'用户编号',umamiAnalytics:'Umami 统计',unknownBuildPlatform:'未知构建平台处理',url:'链接地址',userId:'用户编号',value:'设置值',vertical:'垂直位置',vndb:'视觉小说收藏页',wallpaperModeSwitchable:'允许切换壁纸模式',waves:'波浪效果',wavesSwitchable:'允许切换波浪动画',websiteId:'站点统计编号',widthFull:'导航栏全宽',zIndex:'显示层级',
};

export const fieldOverrides:Record<string,{title?:string;hint?:string}>={
 'siteConfig.title':{title:'博客名称',hint:'显示在浏览器标题、页面标题和分享内容中的站点名称。'},
 'siteConfig.subtitle':{title:'博客副标题',hint:'用于站点介绍及部分首页展示位置。'},
 'siteConfig.description':{title:'网站介绍',hint:'主要用于搜索结果和网页分享摘要，建议简洁自然。'},
 'siteConfig.site_url':{title:'博客正式地址',hint:'用于生成规范链接和订阅地址，修改前请确认实际域名。'},
 'siteConfig.keywords':{title:'搜索关键词',hint:'填写访客可能搜索的词，每个条目一个关键词。'},
 'siteConfig.themeColor.hue':{title:'品牌主题颜色',hint:'0～360 的色相角；修改后重新构建生效，访客自行选择的主题色可能优先。'},
 'siteConfig.themeColor.defaultMode':{title:'默认明暗模式',hint:'未设置过主题偏好的访客会使用这个模式。'},
 'siteConfig.pageWidth':{title:'内容区域宽度',hint:'单位 rem；数值越大文章与页面可显示得越宽。'},
 'siteConfig.navbar.logo.type':{title:'网站标志类型',hint:'图片标志或图标库标志。选择图片时可预览下方路径。'},
 'siteConfig.navbar.logo.value':{title:'网站标志图片 / 图标标识',hint:'填写本地图片路径或 HTTPS 图片地址；选择图标库类型时填写图标标识。'},
 'siteConfig.favicon':{title:'浏览器小图标',hint:'浏览器标签页和收藏夹使用；图标列表中可填写多个图片地址。'},
 'siteConfig.pagination.postsPerPage':{title:'每页文章篇数',hint:'控制文章列表的分页大小。'},
 'siteConfig.imageOptimization.quality':{title:'图片压缩质量',hint:'数值越低文件通常越小，但画质也会下降。'},
 'profileConfig.avatar':{title:'个人头像',hint:'接受 /assets/...、src/assets/...、public/... 或 HTTPS 网络图片。'},
 'profileConfig.links':{title:'个人社交链接',hint:'可以编辑各链接的名称、图标和目标地址。'},
 'backgroundWallpaper.src':{title:'壁纸图片',hint:'分别指定电脑和手机图片；可以使用本地资源或网络图片。'},
 'backgroundWallpaper.mode':{title:'首页壁纸展示方式',hint:'横幅、全屏、透明覆盖或不使用壁纸。'},
 'backgroundWallpaper.common.homeText':{title:'首页展示文字',hint:'首页大标题、副标题及打字机效果。'},
 'coverImageConfig.randomCoverImage':{title:'随机封面图片',hint:'文章未设置封面时的候选图片与使用策略。'},
 'displaySettingsConfig.enable':{title:'允许访客打开外观设置',hint:'启用可能增加前端体积；环境变量可覆盖此默认值。'},
 'sidebarLayoutConfig.leftComponents':{title:'左侧栏组件',hint:'设置左侧栏包含什么组件，及各组件的显示位置和行为。'},
 'sidebarLayoutConfig.rightComponents':{title:'右侧栏组件',hint:'设置右侧栏包含什么组件，及各组件的显示位置和行为。'},
 'analyticsConfig.googleAnalyticsId':{title:'Google Analytics 跟踪编号',hint:'留空表示不配置此统计服务。'},
};

export const sectionFieldGroups:Record<string,{id:string;title:string;description:string;keys:string[]}[]>={
 siteConfig:[
  {id:'identity',title:'网站名称与搜索展示',description:'访客在浏览器、搜索结果和分享链接中看到的信息。',keys:['title','subtitle','site_url','description','keywords','siteStartDate','timezone','lang']},
  {id:'branding',title:'顶部导航与网站标志',description:'导航栏标题、标志图片、菜单位置和浏览器图标。',keys:['navbar','favicon']},
  {id:'theme',title:'整体外观',description:'主题颜色、页面宽度和卡片风格。',keys:['themeColor','pageWidth','card']},
  {id:'pages',title:'功能页面入口',description:'选择哪些独立页面在博客里可用。',keys:['pages','bangumi','bilibili']},
  {id:'listing',title:'文章列表与标签',description:'文章卡片、分类、标签和分页展示方式。',keys:['categoryBar','categoryStyle','tagStyle','foldArticle','postListLayout','pagination']},
  {id:'reading',title:'文章阅读体验',description:'分享按钮、目录、推荐文章和过期提示。',keys:['post']},
  {id:'technical',title:'订阅与图片优化',description:'订阅源、图片格式、压缩和图片来源规则。',keys:['imageOptimization','feed']},
 ],
 backgroundWallpaper:[
  {id:'wallpaper',title:'壁纸来源与展示方式',description:'为桌面和手机分别配置图片，并选择网站壁纸布局。',keys:['mode','src','playerEnable']},
  {id:'head',title:'首页横幅与标题',description:'首页横幅、标题文字、轮播和显示效果。',keys:['banner','common']},
  {id:'fullscreen',title:'全屏与透明效果',description:'覆盖层、透明度、模糊与全屏交互。',keys:['overlay','fullscreen']},
 ],
 profileConfig:[
  {id:'personal',title:'头像与自我介绍',description:'网站作者展示信息与头像预览。',keys:['avatar','name','bio']},
  {id:'social',title:'社交与联系方式',description:'个人主页、社交账号与外部链接。',keys:['links']},
 ],
 sidebarLayoutConfig:[
  {id:'layout',title:'侧边栏布局',description:'决定侧栏的位置、尺寸及不同设备上的显示方式。',keys:['enable','position','tabletSidebar','hideSidebarOnPostPage','noSidebarContentWidth']},
  {id:'widgets',title:'侧边栏内容',description:'逐个编辑左右侧栏和手机底部的组件。',keys:['leftComponents','rightComponents','mobileBottomComponents']},
 ],
};

export function chineseLabel(section:string,path:string[]):string{
 const key=path.at(-1)||'';
 if(/^\d+$/.test(key)){
  const index=Number(key)+1;
  const parent=path.at(-2);
  if(section==='backgroundWallpaper'&&path.includes('src')){
   if(parent==='desktop')return `第 ${index} 张电脑壁纸`;
   if(parent==='mobile')return `第 ${index} 张手机壁纸`;
   return `第 ${index} 张壁纸`;
  }
  if(parent==='favicon')return `第 ${index} 个浏览器图标`;
  if(parent==='links')return `第 ${index} 条社交链接`;
  if(parent==='categoryOrder')return `第 ${index} 类内容`;
  return `第 ${index} 项`;
 }
 const full=section+'.'+path.join('.');
 const direct=fieldOverrides[full]?.title;
 if(direct)return direct;
 const base=fieldNames[key];
 return base||'其他设置';
}
export function chineseHelp(section:string,path:string[],value:unknown):string{
 const direct=fieldOverrides[section+'.'+path.join('.')]?.hint;
 if(direct)return direct;
 const k=path.at(-1)||'';
 if(k==='src'||k==='avatar'||k==='image')return '本地图片可填写以 / 开头的地址、public/ 路径或 src/assets/ 路径，也可以使用 HTTPS 网络地址。';
 if(k==='url'||k==='apiUrl'||k==='server')return '填写实际访问地址；外部服务一般使用 HTTPS。';
 if(k==='opacity')return '透明度；数值越大越不透明，具体范围由当前效果决定。';
 if(k==='enable'||k==='enabled')return '开启或关闭此功能，部分效果需要重新构建才能生效。';
 if(typeof value==='number')return '输入数值，保存时会验证字段类型。';
 if(typeof value==='boolean')return '选择是否开启此功能。';
 return '';
}

export function sectionGroups(section:string,data:Record<string,unknown>){
 const groups=sectionFieldGroups[section];
 if(!groups)return [{id:'main',title:'功能设置',description:'在这里编辑此功能的显示和行为。',keys:Object.keys(data)}];
 const used=new Set(groups.flatMap(g=>g.keys));
 const extras=Object.keys(data).filter(k=>!used.has(k));
 return extras.length?[...groups,{id:'other',title:'其他设置',description:'较少使用的附加功能。',keys:extras}]:groups;
}

const imageExt=/\.(?:png|jpe?g|webp|avif|gif|svg|ico|bmp|apng)(?:[?#].*)?$/i;
/** Only actual photo properties; a generic URL can point to a webpage/API. */
export function isImageSetting(section:string,path:string[],value:unknown):boolean{
 if(typeof value!=='string')return false;
 const leaf=path.at(-1)||'';
 if(/^\d+$/.test(leaf))return isImageSetting(section,path.slice(0,-1),value);
 if(leaf==='avatar'||leaf==='image'||leaf==='src'||leaf==='cover'||leaf==='coverUrl')return true;
 if(leaf==='value'&&path.includes('logo'))return true;
 if(leaf==='icon')return imageExt.test(value);
 if(leaf==='url')return imageExt.test(value);
 if(section==='backgroundWallpaper'&&path.includes('src'))return true;
 return imageExt.test(value)&&!/^\w+:/.test(value.replace(/^https?:/i,''));
}
export function normalizeLocalImagePath(input:string):string|null{
 let text=input.trim().replaceAll('\\','/');
 if(!text||/^(?:data:|blob:|javascript:|file:)/i.test(text))return null;
 if(/^https?:\/\//i.test(text))return null;
 text=text.replace(/^\.\//,'').replace(/^public\//,'').replace(/^src\//,'');
 if(text.startsWith('/'))text=text.slice(1);
 if(text.startsWith('assets/'))text=text.replace(/^assets\//,'assets/');
 if(!text||text.includes('..')||/[?#]/.test(text)||!/^[\w\-\u0080-\uffff/. %()]+$/.test(text))return null;
 return '/'+text.split('/').map(encodeURIComponent).join('/');
}
export function isRemoteImageUrl(value:string):boolean{
 try{const url=new URL(value.trim());return url.protocol==='https:'||url.protocol==='http:';}catch{return false;}
}
