/**
 * EdgeOne Blob Imagebed: Delete image from EdgeOne Blob Storage
 */
import { isAuthenticated } from '../../../src/server/auth.mjs';
import { createEdgeOneStore } from '../../../src/server/edgeone-store.mjs';

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json;charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-imagebed-token, x-firefly-cms',
		},
	});
}

function verifyAuth(request, config) {
	if (isAuthenticated(request, config)) return true;

	const expectedToken = config.FIREFLY_IMAGEBED_TOKEN || config.FIREFLY_ADMIN_PASSWORD;
	if (!expectedToken) return true;

	const authHeader = request.headers.get('Authorization') || '';
	const tokenHeader = request.headers.get('x-imagebed-token') || '';
	const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

	return (tokenHeader || bearerToken) === expectedToken;
}

export async function onRequest({ request, env = {}, store = null }) {
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-imagebed-token, x-firefly-cms',
			},
		});
	}

	if (request.method !== 'POST') {
		return json({ ok: false, code: 405, error: 'Method not allowed' }, 405);
	}

	const config = { ...process.env, ...env };

	if (!verifyAuth(request, config)) {
		return json({ ok: false, code: 401, error: 'Unauthorized: Invalid token or session' }, 401);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const rawKey = body?.key;

		if (!rawKey || typeof rawKey !== 'string' || rawKey.includes('..')) {
			return json({ ok: false, code: 400, error: 'Invalid key' }, 400);
		}

		const cleanKey = rawKey.replace(/^\/+/, '').replace(/^imagebed\//, '');
		const storage = store || (await createEdgeOneStore({ env: config }));
		const rawStore =
			storage.store ||
			(await import('@edgeone/pages-blob')).getStore({
				name: config.FIREFLY_BLOB_STORE_NAME || 'firefly-content',
			});

		await rawStore.delete(`imagebed/${cleanKey}`).catch(() => {});
		await rawStore.delete(cleanKey).catch(() => {});

		return json({ ok: true, code: 200, msg: 'Deleted successfully' });
	} catch (e) {
		return json({ ok: false, code: 500, error: e?.message || 'Delete failed' }, 500);
	}
}

export default onRequest;
