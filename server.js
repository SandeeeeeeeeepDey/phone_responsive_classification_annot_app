import express from 'express';
import { readdir, readFile, writeFile, access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

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

// ─── Helpers ────────────────────────────────────────────────────────────────────
function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

async function loadAnnotations() {
  try {
    const data = await readFile(ANNOTATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveAnnotations(annotations) {
  await writeFile(ANNOTATIONS_FILE, JSON.stringify(annotations, null, 2), 'utf-8');
}

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

    folders.sort((a, b) => {
      if (a.name === '_root') return -1;
      if (b.name === '_root') return 1;
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
  const filePath = folder === '_root'
    ? path.join(ROOT_FOLDER, filename)
    : path.join(ROOT_FOLDER, folder, filename);

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

// --- API: Save a single annotation ---
app.post('/api/annotations', async (req, res) => {
  try {
    const { key, status } = req.body;
    if (!key || !status) {
      return res.status(400).json({ error: 'key and status required' });
    }
    const annotations = await loadAnnotations();
    annotations[key] = status;
    await saveAnnotations(annotations);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Reset all annotations ---
app.delete('/api/annotations', async (req, res) => {
  try {
    await saveAnnotations({});
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
app.listen(PORT, '0.0.0.0', () => {
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
