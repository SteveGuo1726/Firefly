// 友链配置
export type FriendLink = {
	title: string; // 友链标题
	imgurl: string; // 头像图片URL
	desc: string; // 友链描述
	siteurl: string; // 友链地址
	feedurl?: string; // RSS/Atom 订阅地址，用于友链朋友圈
	fetchFeed?: boolean; // 是否在友链朋友圈中抓取该站点 RSS/Atom，默认 true
	tags?: string[]; // 标签数组
	weight: number; // 权重，数字越大排序越靠前
	enabled: boolean; // 是否启用
};

export type FriendCircleConfig = {
	enable?: boolean; // 是否显示友链朋友圈
	title?: string; // 朋友圈区块标题
	description?: string; // 朋友圈区块描述
	apiUrl?: string; // 运行时优先读取的朋友圈 JSON 地址
	fallbackApiUrl?: string; // 优先地址失败时的兜底 JSON 地址
	pageSize?: number; // 前端每次显示文章数量
	cacheSeconds?: number; // API 缓存时间，单位秒
	requestTimeout?: number; // 单个 RSS 请求超时时间，单位毫秒
	maxArticlesPerFriend?: number; // 每个友链最多读取文章数
	feedPaths?: string[]; // 没有填写 feedurl 时尝试探测的订阅路径
};

export type FriendsPageConfig = {
	title?: string; // 页面标题，留空则使用 i18n 中的翻译
	description?: string; // 页面描述，留空则使用 i18n 中的翻译
	showCustomContent?: boolean; // 是否显示自定义内容（friends.mdx）
	showComment?: boolean; // 是否显示评论区，默认 true
	randomizeSort?: boolean; // 是否打乱排序，如果为 true，将忽略 weight，随机排序
};
