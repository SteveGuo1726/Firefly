<script lang="ts">
import {onMount} from "svelte";
import bundledSettings from "@/data/site-settings.json";
import {assertSiteSettings} from "@/utils/settings/managed-config";
import type {GitHubAdminSession} from "@/utils/admin/github-session";
import {getGitHubRepoConfigFromSession} from "@/utils/admin/github-session";
import {fetchRepoFile,saveRepoFile} from "@/utils/write/github";
import SiteSettingsImagePreview from "./SiteSettingsImagePreview.svelte";
import SiteSettingsListEditor from "./SiteSettingsListEditor.svelte";
import {isManagedList} from "@/utils/settings/settings-list-schema";
import {numberPresentation,percentageText} from "@/utils/settings/settings-controls";
import {sectionCategories,sectionGroups,chineseLabel,chineseHelp,isImageSetting} from "@/utils/settings/settings-editor-ui";

export let session:GitHubAdminSession;
const configPath="src/data/site-settings.json";
const draftKey="firefly.site-settings.local-draft.v1";
const initial=structuredClone(bundledSettings);
const metadata:Record<string,{title:string;hint:string}>={
 siteConfig:{title:"站点与 SEO",hint:"标题、介绍、语言、主题色、页面宽度、页面及文章展示"},
 announcementConfig:{title:"站点公告",hint:"公告文案、链接与关闭开关"},
 profileConfig:{title:"个人资料",hint:"头像、名称、简介和社交链接"},
 backgroundWallpaper:{title:"首页与壁纸",hint:"桌面与移动端背景、横幅、覆盖与全屏参数"},
 dynamicConfig:{title:"动态顶��q�^