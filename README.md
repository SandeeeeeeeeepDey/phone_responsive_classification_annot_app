# DeepAnnotate

Mobile-first **multi-class** image annotation tool. Swipe on your phone to classify images served from your desktop over LAN.

**Key specs (source-verified):**
- Images served at **full resolution** — no resizing (`res.sendFile`, `server.js:298`)
- **70-image preload window**: 50 ahead + 20 behind current index (`AnnotationView.jsx:63-64`)
- **1-hour browser cache** per image (`Cache-Control: public, max-age=3600`, `server.js:297`)
- Annotations written to **Redis first**, flushed to `annotations.json` asynchronously via atomic rename

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React 19, Vite 5, Tailwind CSS 4                |
| Gestures   | @use-gesture/react                              |
| Animations | Framer Motion, React Spring                     |
| Backend    | Node.js, Express 5                              |
| Storage    | Redis (primary) + `annotations.json` (disk sync)|

---

## Architecture

```
┌──────────────────────┐       ┌───────────────────────────────┐
│  Phone (Browser)     │◄─────►│  Desktop                      │
│                      │  LAN  │                               │
│  React SPA (Vite)    │       │  Express API    :3001         │
│  - Dashboard         │       │  Redis          :6379         │
│  - SubfolderView     │       │  annotations.json (disk sync) │
│  - AnnotationView    │       │                               │
└──────────────────────┘       └───────────────────────────────┘
```

Annotations are written to Redis on every save and asynchronously flushed to `annotations.json` (atomic rename). On startup, `annotations.json` is loaded into Redis if it exists.

---

## Prerequisites

- Node.js ≥ 18, npm ≥ 9
- Docker (for Redis)
- Images organized as:
  ```
  MyImages/
  ├── subfolder_a/
  │   ├── img001.jpg
  │   └── img002.png
  └── subfolder_b/
      └── img003.jpg
  ```
  Images placed directly in the root are served under a virtual **"Root Images"** folder.

---

## Setup & Usage

```bash
git clone https://github.com/SandeeeeeeeeepDey/phone_responsive_classification_annot_app.git
cd phone_responsive_classification_annot_app
npm install
npm run build

# Start Redis
docker compose up -d

# Start server (pass your image folder as the argument)
node server.js "D:\MyDataset\Images"
```

On startup, the server prints the network URL — open it on your phone (same Wi-Fi network).

---

## Gesture Controls

Gestures are **only active when the image is fully zoomed out** (`scale = 1`). While zoomed in, all touch events pan the image.

| Gesture     | Action                                                        |
|-------------|---------------------------------------------------------------|
| Swipe →     | **Confirm** — applies pseudo-label or first class in list     |
| Swipe ←     | **Relabel** — opens class picker to select a different class  |
| Swipe ↑     | **Skip**                                                      |
| Swipe ↓     | **Back** — go to previous image                               |
| Pinch       | Zoom in/out (max 5×)                                          |

---

## Dataset Mode (CSV)

Place a `.csv` file in the root image folder. The server auto-detects it and adds a **"Dataset Mode"** folder in the dashboard showing existing labels for review.

**Column detection** (case-insensitive, partial match):
- Image column: header contains `image`, `file`, or `name` (excluding `unnamed`)
- Label column: header contains `label`, `class`, or `pseudo` (excluding `unnamed`)

```python
# Minimum viable CSV (Pandas)
df.to_csv('labels.csv', index=False)  # columns: image_name, label
```

---

## Development Mode

```bash
# Terminal 1
docker compose up -d
node server.js "path/to/images"

# Terminal 2 — hot reload, proxies /api to :3001
npm run dev
```

---

## API Reference

| Method   | Endpoint                        | Description                          |
|----------|---------------------------------|--------------------------------------|
| `GET`    | `/api/config`                   | Server config (`rootPath`)           |
| `GET`    | `/api/folders`                  | Folders with annotation counts       |
| `GET`    | `/api/folders/:name/images`     | Images in a folder                   |
| `GET`    | `/api/images/:folder/:filename` | Serve image file (1h cache)          |
| `GET`    | `/api/annotations`              | All annotations                      |
| `POST`   | `/api/annotations`              | Save `{ key, status }`               |
| `DELETE` | `/api/annotations`              | Reset all annotations                |
| `GET`    | `/api/pseudo-labels`            | CSV-loaded labels map                |

**Annotation storage format** (`annotations.json`):
```json
{
  "subfolder_a/img001.jpg": "true",
  "subfolder_a/img002.png": "false",
  "subfolder_b/img003.jpg": "skip"
}
```

---

## Project Structure

```
phone_responsive_classification_annot_app/
├── server.js                  # Express API + static serving + Redis client
├── docker-compose.yml         # Redis container
├── vite.config.js             # Vite config (proxy /api → :3001, host 0.0.0.0)
├── src/
│   ├── App.jsx                # Root component + annotation context
│   ├── components/
│   │   ├── Dashboard.jsx      # Folder list + progress overview
│   │   ├── SubfolderView.jsx  # Image grid within a folder
│   │   └── AnnotationView.jsx # Gesture annotation interface
│   └── index.css              # Global styles + design tokens
└── dist/                      # Production build (gitignored)
```

---

## License

MIT
