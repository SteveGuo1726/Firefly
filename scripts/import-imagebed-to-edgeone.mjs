/**
 * Import backed-up Cloudflare imagebed files directly into EdgeOne Pages Blob Storage.
 * Part of Option B: complete native EdgeOne storage migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getStore } from '@edgeone/pages-blob';

const tokenFile = 'C:/Users/SteveGuo/.edgeone/37493e0b9fdfe8b8bb0c750edb8618d485d895ff4cf8c6e7ecd32fc0ed3b8f13';
if (!fs.existsSync(tokenFile)) {
  console.error('EdgeOne CLI token file not found at:', tokenFile);
  process.exit(1);
}

const tokenData = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
const token = tokenData.value?.Token;
if (!token) {
  console.error('No Token found in EdgeOne token file');
  process.exit(1);
}

const backupDir = 'C:/Users/SteveGuo/.gemini/antigravity/brain/3cfa0f3c-f3e8-4bc2-90f4-d03cee80875e/scratch/imagebed_backup/files';
if (!fs.existsSync(backupDir)) {
  console.error('Imagebed backup directory not found:', backupDir);
  process.exit(1);
}

function listFiles(dir, base = dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(full, base));
    } else {
      result.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return result;
}

const files = listFiles(backupDir);
console.log(`Found ${files.length} backed-up files to import into EdgeOne Blob Storage.`);

// Both projects: firefly-blog (blog.casto.top) and firefly-site (preview)
const targetProjects = [
  { id: 'makers-uwovdt3b3agz', name: 'firefly-blog (blog.casto.top)' },
  { id: 'makers-bctiacbv4qmu', name: 'firefly-site (firefly-site.edgeone.cool)' }
];

async function importToProject(projectId, projectName) {
  console.log(`\n========================================`);
  console.log(`Starting import to [${projectName}] (${projectId})...`);
  console.log(`========================================`);

  const store = getStore({
    name: 'firefly-content',
    projectId,
    token
  });

  let importedCount = 0;
  let totalBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const relKey = files[i];
    const fullPath = path.join(backupDir, relKey);
    const buf = fs.readFileSync(fullPath);
    totalBytes += buf.length;

    const t0 = Date.now();
    // Store under both 'imagebed/' + relKey and relKey for direct path compatibility
    await store.set('imagebed/' + relKey, buf, {
      cacheControl: 'public, max-age=31536000, immutable'
    });
    await store.set(relKey, buf, {
      cacheControl: 'public, max-age=31536000, immutable'
    });

    importedCount++;
    console.log(`[${i + 1}/${files.length}] Imported ${relKey} (${(buf.length / 1024).toFixed(1)} KB) in ${Date.now() - t0}ms`);
  }

  // Also import the gallery manifest if photos/.firefly-gallery JSON exists
  const galleryJsonFile = files.find(f => f.startsWith('photos/.firefly-gallery/') && f.endsWith('.json'));
  if (galleryJsonFile) {
    try {
      const manifestContent = JSON.parse(fs.readFileSync(path.join(backupDir, galleryJsonFile), 'utf8'));
      // Transform photo URLs to use relative EdgeOne /file/ path
      if (Array.isArray(manifestContent.albums)) {
        for (const album of manifestContent.albums) {
          if (album.cover && !album.cover.startsWith('http')) {
            album.coverUrl = `/file/${album.cover}`;
          }
          if (Array.isArray(album.photos)) {
            for (const p of album.photos) {
              if (p.key) p.url = `/file/${p.key}`;
            }
          }
        }
      }
      await store.setJSON('firefly/gallery/manifest/v1.json', manifestContent);
      console.log('✓ Uploaded parsed gallery manifest to firefly/gallery/manifest/v1.json');
    } catch (err) {
      console.warn('Could not parse/upload gallery manifest:', err.message);
    }
  }

  console.log(`✓ Completed import for ${projectName}: ${importedCount} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

async function run() {
  for (const p of targetProjects) {
    await importToProject(p.id, p.name);
  }
  console.log('\n🎉 ALL FILES SUCCESSFULLY IMPORTED TO EDGEONE BLOB STORAGE!');
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
