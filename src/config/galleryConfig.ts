import type { GalleryConfig } from "@/types/galleryConfig";

// 相册配置
export const galleryConfig: GalleryConfig = {
	// 相册列表
	albums: [
		{
			id: "firefly-2026",
			name: "可爱流萤",
			description: "飞萤之火自无梦的长夜亮起，绽放在终竟的明天。",
			date: "2026-01-01",
			location: "崩坏：星穹铁道",
			tags: ["崩坏星穹铁道", "流萤"],
		},
		{
			id: "encrypted-test",
			name: "加密相册示例",
			description:
				"这是一个加密相册的示例，设置了访问密码，只有输入正确的密码才能查看相册内容。",
			date: "2026-02-01",
			location: "崩坏：星穹铁道",
			tags: ["加密相册", "示例"],
			password: "123456",
			passwordHint: "示例密码123456",
		},
		{
			id: "castorice-2026",
			name: "遐蝶图集",
			description: "星穹漫遐，蝶携清梦。",
			date: "2026-06-25",
			location: "崩坏：星穹铁道",
			tags: [],
		},
	],

	// 瀑布流最小列宽(px)，浏览器根据容器宽度自动计算列数，默认 240
	// 值越小列数越多，值越大列数越少
	columnWidth: 240,
};
