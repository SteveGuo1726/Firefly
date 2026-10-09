<script lang="ts">
import { onMount } from "svelte";
export let postId: string;
export let siteTitle: string;

function updateMeta(name: string, value: string) {
	const element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
	if (element) element.content = value;
}

onMount(() => {
	const apply = async () => {
		try {
			const response = await fetch(
				`/api/live-content/item?kind=post&id=${encodeURIComponent(postId)}`,
				{ cache: "no-store" },
			);
			if (response.status === 410) {
				window.location.replace("/404/");
				return;
			}
			if (response.status === 404) return;
			if (!response.ok) return;
			const item = await response.json();
			const meta = item?.meta || {};
			if (!meta.html || meta.draft || meta.protected) return;

			for (const node of document.querySelectorAll<HTMLElement>("[data-live-post-title]")) {
				node.textContent = String(meta.title || postId);
			}
			const content = document.querySelector<HTMLElement>("[data-live-post-content]");
			if (content) content.innerHTML = String(meta.html);

			const title = String(meta.title || postId);
			document.title = `${title} - ${siteTitle}`;
			updateMeta("description", String(meta.description || title));
			document.documentElement.dataset.livePostRevision = String(item.revision || "");
		} catch (error) {
			console.warn("Live post overlay unavailable", error);
		}
	};
	void apply();
});
</script>
