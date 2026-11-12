/**
 * EdgeOne Blob Imagebed: Direct image upload handler
 */
import { isAuthenticated } from '../../../src/server/auth.mjs';
import { createEdgeOneStore } from '../../../src/server/edgeone-store.mjs';

const MIME_MAP = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
};

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json;charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-imagebed-token, x-firefly-cms',
		},
	});
}

function verifyAuth(request, config) {
	// 1. Session-based admin auth
	if (isAuthenticated(request, config)) return true;

	// 2. Token-based auth
	const expectedToken = config.FIREFLY_IMAGEBED_TOKEN || config.FIREFLY_ADMIN_PASSWORD;
	if (!expectedToken) {
		// If no token is set in environment, allow open upload
		return true;
	}

	const authHeader = request.headers.get('Authorization') || '';
	const tokenHeader = request.headers.get('x-imagebed-token') || '';
	const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

	const provided = tokenHeader || bearerToken;
	return provided === expectedToken;
}

export async function onRequest({ request, env = {}, store = null }) {
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-imagebed-token, x-firefly-cms',
			},
		});
	}

	if (request.method !== 'POST') {
		return json({ ok: false, code: 405, error: 'Method not allowed' }, 405);
	}

	const config = { ...process.env, ...env };

	if (!verifyAuth(request, config)) {
		return json({ ok: false, code: 401, error: 'Unauthorized: Invalid imagebed token or session' }, 401);
	}

	try {
		const contentType = request.headers.get('content-type') || '';
		let file = null;
		let customFolder = 'photos/upload';

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			file = formData.get('file');
			const folderParam = formData.get('folder');
			if (typeof folderParam === 'string' && /^[a-zA-Z0-9_\-/]+$/.test(folderParam)) {
				customFolder = folderParam.replace(/^\/+|\/+$/g, '');
			}
		} else {
			return json({ ok: false, code: 400, error: 'Multipart form-data expected with "file" field' }, 400);
		}

		if (!(file instanceof File)) {
			return json({ ok: false, code: 400, error: 'No file provided' }, 400);
		}

		if (file.size > 30 * 1024 * 1024) {
			return json({ ok: false, code: 413, error: 'File exceeds 30MB limit' }, 413);
		}

		const fileType = file.type || '';
		if (!MIME_MAP[fileType] && !/^image\//i.test(fileType)) {
			return json({ ok: false, code: 400, error: 'Unsupported file type. Only images are allowed' }, 400);
		}

		const rawExt = file.name.split('.').pop()?.toLowerCase() || MIME_MAP[fileType] || 'webp';
		const sanitizedBase = file.name
			.replace(/\.[^/.]+$/, '')
			.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')
			.slice(0, 50);

		const timestamp = Date.now();
		const finalFilename = `${timestamp}_${sanitizedBase || 'img'}.${rawExt}`;
		const relativeKey = `${customFolder}/${finalFilename}`;

		const storage = store || (await createEdgeOneStore({ env: config }));
		const rawStore =
			storage.store ||
			(await import('@edgeone/pages-blob')).getStore({
				name: config.FIREFLY_BLOB_STORE_NAME || 'firefly-content',
			});

		const arrayBuffer = await file.arrayBuffer();

		// Save both under imagebed/ and direct key for universal compatibility
		await rawStore.set(`imagebed/${relativeKey}`, arrayBuffer, {
			cacheControl: 'public, max-age=31536000, immutable',
		});
		await rawStore.set(relativeKey, arrayBuffer, {
			cacheControl: 'public, max-age=31536000, immutable',
		});

		const urlPath = `/file/${relativeKey}`;

		return json({
			ok: true,
			code: 200,
			msg: 'Upload successful',
			data: {
				key: relativeKey,
				url: urlPath,
				name: file.name,
				size: file.size,
				type: fileType,
				time: timestamp,
			},
		});
	} catch (e) {
		return json({ ok: false, code: 500, error: e?.message || 'Storage error' }, 500);
	}
}

export default onRequest;
