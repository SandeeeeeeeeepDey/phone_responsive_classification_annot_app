import express from 'express';
import { readdir, readFile, writeFile, access, rename } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ──────────────────────────────────────────────────────────────
const ROOT_FOLDER = process.argv[2];
if (!ROOT_FOLDER) {
  console.error('\n❌  Usage: node server.js <path-to-image-folder>\n');
  console.error('   Example: node server.js "D:\\MyImages"');
  process.exit(1);
}

// Verify folder exists
try {
  await access(ROOT_FOLDER);
} catch {
  console.error(`\n❌  Folder not found: ${ROOT_FOLDER}\n`);
  process.exit(1);
}

const ANNOTATIONS_FILE = path.join(ROOT_FOLDER, 'annotations.json');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg']);
const PORT = process.env.PORT || 3001;

// Pseudo-labels from CSV/Metadata
let PSEUDO_LABELS = {}; // { "folder/filename": "pseudo_label" }
let HAS_METADATA = false;

// --- Redis Client Setup ---
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff with a max limit
      if (retries > 20) {
        console.error('❌ Redis max retries reached. Exiting...');
        return new Error('Max retries reached');
      }
      const delay = Math.min(retries * 100, 3000);
      console.log(`⏱️  Redis reconnecting in ${delay}ms...`);
      return delay;
    }
  }
});

redisClient.on('error', err => console.error('❌ Redis Client Error:', err.message));
redisClient.on('connect', () => console.log('✅ Connected to Redis successfully.'));
redisClient.on('reconnecting', () => console.log('🔄 Reconnecting to Redis...'));
redisClient.on('ready', () => console.log('🚀 Redis is ready to receive commands.'));

await redisClient.connect();
const REDIS_KEY = `annotations:${ROOT_FOLDER}`;

// ─── Helpers ────────────────────────────────────────────────────────────────────
function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// --- Disk Synchronization (Atomic & Debounced) ---
let isSyncing = false;
let syncRequested = false;

async function syncToDisk() {
  if (isSyncing) {
    syncRequested = true;
    return;
  }
  isSyncing = true;
  syncRequested = false;

  try {
    const annotations = await redisClient.hGetAll(REDIS_KEY);
    const tmpFile = `${ANNOTATIONS_FILE}.tmp`;
    await writeFile(tmpFile, JSON.stringify(annotations, null, 2), 'utf-8');
    await rename(tmpFile, ANNOTATIONS_FILE);
  } catch (err) {
    console.error('❌ Failed to sync annotations to disk:', err);
  } finally {
    isSyncing = false;
    if (syncRequested) {
      syncToDisk().catch(console.error);
    }
  }
}

async function initializeAnnotations() {
  try {
    const data = await readFile(ANNOTATIONS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Object.keys(parsed).length > 0) {
      await redisClient.del(REDIS_KEY);
      for (const [key, val] of Object.entries(parsed)) {
        await redisClient.hSet(REDIS_KEY, key, String(val));
      }
    }
  } catch {
    // Ignored if file missing or invalid
  }
}
await initializeAnnotations();

async function loadAnnotations() {
  return await redisClient.hGetAll(REDIS_KEY);
}

async function loadMetadata() {
  try {
    const files = await readdir(ROOT_FOLDER);
    const csvFile = files.find(f => f.endsWith('.csv'));
    if (!csvFile) return;

    const content = await readFile(path.join(ROOT_FOLDER, csvFile), 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 1) return;

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const imgIdx = headers.findIndex(h => h.includes('image') || h.includes('file') || h.includes('name'));
    const labelIdx = headers.findIndex(h => h.includes('label') || h.includes('class') || h.includes('pseudo'));

    if (imgIdx === -1 || labelIdx === -1) {
      console.warn(`⚠️  Found CSV ${csvFile} but couldn't identify image/label columns in headers: ${headers.join(', ')}`);
      return;
    }

    const labels = {};
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
        if (parts.length > Math.max(imgIdx, labelIdx)) {
            const imgName = parts[imgIdx];
            const label = parts[labelIdx];
            labels[imgName] = label;
        }
    }
    PSEUDO_LABELS = labels;
    HAS_METADATA = true;
    console.log(`✅  Loaded ${Object.keys(labels).length} pseudo-labels from ${csvFile}`);
  } catch (err) {
    console.error('❌  Error loading metadata:', err.message);
  }
}

// Initial metadata load
await loadMetadata();

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

// ─── Express App ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// --- API: Server info ---
app.get('/api/config', (req, res) => {
  res.json({ rootPath: ROOT_FOLDER });
});

// --- API: List folders with annotation counts ---
app.get('/api/folders', async (req, res) => {
  try {
    const annotations = await loadAnnotations();
    const entries = await readdir(ROOT_FOLDER, { withFileTypes: true });
    const folders = [];
    const rootImages = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const folderPath = path.join(ROOT_FOLDER, entry.name);
        try {
          const files = await readdir(folderPath);
          const images = files.filter(isImageFile).sort();
          if (images.length > 0) {
            const annotatedCount = images.filter(
              img => annotations[`${entry.name}/${img}`]
            ).length;
            folders.push({
              name: entry.name,
              totalCount: images.length,
              annotatedCount,
            });
          }
        } catch {
          // Skip folders we can't read
        }
      } else if (entry.isFile() && isImageFile(entry.name)) {
        rootImages.push(entry.name);
      }
    }

    // If images exist directly in root, create a virtual "_root" folder
    if (rootImages.length > 0) {
      const annotatedCount = rootImages.filter(
        img => annotations[`_root/${img}`]
      ).length;
      folders.unshift({
        name: '_root',
        displayName: 'Root Images',
        totalCount: rootImages.length,
        annotatedCount,
      });
    }

    // If metadata exists, add a special "Dataset" folder
    if (HAS_METADATA) {
      const metadataImages = Object.keys(PSEUDO_LABELS);
      const annotatedCount = metadataImages.filter(img => annotations[`_dataset/${img}`]).length;
      folders.push({
        name: '_dataset',
        displayName: 'Dataset Mode',
        totalCount: metadataImages.length,
        annotatedCount,
        isDataset: true
      });
    }

    folders.sort((a, b) => {
      if (a.name === '_dataset') return -1;
      if (a.name === '_root') return (b.name === '_dataset' ? 1 : -1);
      if (b.name === '_dataset') return 1;
      if (b.name === '_root') return (a.name === '_dataset' ? -1 : 1);
      return a.name.localeCompare(b.name);
    });

    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: List images in a folder ---
app.get('/api/folders/:name/images', async (req, res) => {
  try {
    const folderName = req.params.name;
    
    if (folderName === '_dataset') {
        return res.json(Object.keys(PSEUDO_LABELS));
    }

    const folderPath = folderName === '_root'
      ? ROOT_FOLDER
      : path.join(ROOT_FOLDER, folderName);

    // Security: ensure path is within ROOT_FOLDER
    const resolved = path.resolve(folderPath);
    if (!resolved.startsWith(path.resolve(ROOT_FOLDER))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const files = await readdir(folderPath);
    const images = files.filter(isImageFile).sort();
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Serve an image file ---
app.get('/api/images/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  let filePath;

  if (folder === '_dataset') {
    // For dataset mode, search for the image file recursively or in root
    // To keep it simple, we assume it's either in root or we search for it
    filePath = path.join(ROOT_FOLDER, filename);
  } else {
    filePath = folder === '_root'
      ? path.join(ROOT_FOLDER, filename)
      : path.join(ROOT_FOLDER, folder, filename);
  }

  // Security: prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT_FOLDER))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(resolved, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Image not found' });
    }
  });
});

// --- API: Get all annotations ---
app.get('/api/annotations', async (req, res) => {
  const annotations = await loadAnnotations();
  res.json(annotations);
});

// --- API: Get pseudo labels ---
app.get('/api/pseudo-labels', (req, res) => {
  res.json(PSEUDO_LABELS);
});

// --- API: Save a single annotation ---
app.post('/api/annotations', async (req, res) => {
  try {
    const { key, status } = req.body;
    if (!key || !status) {
      return res.status(400).json({ error: 'key and status required' });
    }
    
    await redisClient.hSet(REDIS_KEY, key, String(status));
    syncToDisk().catch(console.error);
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Reset all annotations ---
app.delete('/api/annotations', async (req, res) => {
  try {
    await redisClient.del(REDIS_KEY);
    syncToDisk().catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Serve built frontend (production) ---
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Not found — run "npm run build" first.');
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  const networkAddresses = getNetworkAddresses();

  console.log('\n┌──────────────────────────────────────────────────────┐');
  console.log('│       🖼️  DeepAnnotate Server Running                │');
  console.log('├──────────────────────────────────────────────────────┤');
  console.log(`│  📁 Root:  ${ROOT_FOLDER}`);
  console.log(`│  📝 Annotations: ${ANNOTATIONS_FILE}`);
  console.log('├──────────────────────────────────────────────────────┤');
  console.log(`│  Local:   http://localhost:${PORT}`);
  networkAddresses.forEach(({ address }) => {
    console.log(`│  Network: http://${address}:${PORT}`);
  });
  console.log('└──────────────────────────────────────────────────────┘');
  console.log('\n  → Open the Network URL on your phone to annotate!\n');
});

// --- Graceful Shutdown ---
async function shutdown() {
  console.log('\n🛑 Shutting down DeepAnnotate Server gracefully...');
  server.close();
  await redisClient.quit();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
