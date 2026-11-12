/**
 * EdgeOne Blob Imagebed: List images in EdgeOne Blob Storage
 */
import { createEdgeOneStore } from '../../../src/server/edgeone-store.mjs';

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json;charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	});
}

const IMAGE_EXTS = new Set(['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif', 'svg']);

export async function onRequest({ request, env = {}, store = null }) {
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			},
		});
	}

	if (request.method !== 'GET') {
		return json({ ok: false, code: 405, error: 'Method not allowed' }, 405);
	}

	const config = { ...process.env, ...env };

	try {
		const storage = store || (await createEdgeOneStore({ env: config }));
		const rawStore =
			storage.store ||
			(await import('@edgeone/pages-blob')).getStore({
				name: config.FIREFLY_BLOB_STORE_NAME || 'firefly-content',
			});

		// Fetch all blobs with prefix imagebed/
		const listRes = await rawStore.list({ prefix: 'imagebed/', limit: 500 }).catch(() => ({ blobs: [] }));
		const blobs = listRes.blobs || [];

		const itemsMap = new Map();

		for (const b of blobs) {
			const cleanKey = b.key.replace(/^imagebed\//, '');
			const ext = cleanKey.split('.').pop()?.toLowerCase() || '';
			if (!IMAGE_EXTS.has(ext)) continue;

			const filename = cleanKey.split('/').pop() || cleanKey;
			// Extract timestamp if filename starts with digits
			const matchTs = filename.match(/^(\d{10,13})_/);
			const time = matchTs ? Number(matchTs[1]) : Date.now();

			itemsMap.set(cleanKey, {
				key: cleanKey,
				url: `/file/${cleanKey}`,
				name: filename,
				size: b.size || 0,
				ext,
				time,
			});
		}

		// Also check direct photos/ prefix if not prefixed by imagebed/
		const photosListRes = await rawStore.list({ prefix: 'photos/', limit: 500 }).catch(() => ({ blobs: [] }));
		for (const b of photosListRes.blobs || []) {
			const cleanKey = b.key;
			const ext = cleanKey.split('.').pop()?.toLowerCase() || '';
			if (!IMAGE_EXTS.has(ext)) continue;
			if (itemsMap.has(cleanKey)) continue;

			const filename = cleanKey.split('/').pop() || cleanKey;
			const matchTs = filename.match(/^(\d{10,13})_/);
			const time = matchTs ? Number(matchTs[1]) : Date.now();

			itemsMap.set(cleanKey, {
				key: cleanKey,
				url: `/file/${cleanKey}`,
				name: filename,
				size: b.size || 0,
				ext,
				time,
			});
		}

		const data = Array.from(itemsMap.values()).sort((a, b) => b.time - a.time);

		return json({
			ok: true,
			code: 200,
			total: data.length,
			data,
		});
	} catch (e) {
		return json({ ok: false, code: 500, error: e?.message || 'Failed to list images' }, 500);
	}
}

export default onRequest;
