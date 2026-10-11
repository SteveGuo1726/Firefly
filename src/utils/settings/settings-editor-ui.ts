/** Chinese-language descriptors for Firefly's centralized, build-time settings. */
export const sectionCategories = [
 {title:'站点基础',description:'博客身份与访问入口',sections:['siteConfig','profileConfig','announcementConfig','licenseConfig']},
 {title:'友链与导航',description:'友情链接、书签与导航菜单',sections:['friendsConfig','friendsPageConfig','friendApplicationConfig','friendCircleConfig','navCustomLinks','booknavConfig','booknavPageConfig']},
 {title:'赞助与音乐',description:'赞助方式、赞助者、歌曲列表',sections:['sponsorConfig','musicPlayerConfig']},
 {title:'外观布局',description:'壁纸、封面、侧边栏和视觉效果',sections:['backgroundWallpaper','displaySettingsConfig','coverImageConfig','sidebarLayoutConfig','sakuraConfig']},
 {title:'内容与组件',description:'动态内容、代码展示和图表',sections:['dynamicConfig','mermaidConfig','plantumlConfig','expressiveCodeConfig']},
 {title:'访问统计',description:'网站分析与访客统计',sections:['analyticsConfig']},
] as const;

/** The labels deliberately do not expose implementation field identifiers. */
export const fieldNames:Record<string,string>={
 site:'本站资料',email:'联系邮箱',notes:'申请注意事项',
 friendsConfig:'友情链接列表',friendsPageConfig:'友链页面',friendApplicationConfig:'友链申请信息',friendCircleConfig:'友链朋友圈',sponsorConfig:'赞助设置',booknavConfig:'书签分类',booknavPag���q�^