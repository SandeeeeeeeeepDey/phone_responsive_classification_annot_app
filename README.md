# 🖼️ DeepAnnotate

A mobile-responsive image classification annotation tool built with React + Vite and a Node.js/Express backend. Designed for fast, gesture-driven binary classification of images on your phone — powered from your desktop.

---

## ✨ Features

- **📱 Mobile-First Design** — Optimized for phone screens with touch gestures
- **👆 Swipe Gestures** — Swipe right for `True`, left for `False`, up to `Skip`, down to go `Back`
- **🔍 Pinch-to-Zoom** — Inspect image details before annotating
- **📊 Progress Dashboard** — Real-time annotation progress per subfolder
- **🎨 Visual Status Indicators** — Color-coded badges (🟢 True, 🔴 False, ⚪ Skip, 🔵 New)
- **⚡ Smart Preloading** — Caches 50 upcoming + 20 previous images for instant navigation
- **📡 LAN Access** — Annotate from your phone while the server runs on your desktop
- **💾 Persistent Storage** — Annotations saved as JSON in the image directory

---

## 🏗️ Architecture

```
┌─────────────────────────┐       ┌──────────────────────────┐
│   Phone (Browser)       │◄─────►│  Desktop (Node Server)   │
│                         │  LAN  │                          │
│  React SPA (Vite)       │       │  Express API (port 3001) │
│  - Dashboard            │       │  - Serves images         │
│  - SubfolderView        │       │  - Manages annotations   │
│  - AnnotationView       │       │  - annotations.json      │
└─────────────────────────┘       └──────────────────────────┘
```

### Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 19, Vite 8, Tailwind CSS 4        |
| Animations | Framer Motion, React Spring             |
| Gestures   | @use-gesture/react                      |
| Backend    | Node.js, Express 5                      |
| Icons      | Lucide React                            |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A folder of images organized in subfolders:
  ```
  MyImages/
  ├── cats/
  │   ├── img001.jpg
  │   └── img002.png
  ├── dogs/
  │   ├── img003.jpg
  │   └── img004.png
  └── ...
  ```

### Installation

```bash
git clone https://github.com/SandeeeeeeeeepDey/phone_responsive_classification_annot_app.git
cd phone_responsive_classification_annot_app
npm install
```

### Usage

#### 1. Build the frontend

```bash
npm run build
```

#### 2. Start the server

```bash
node server.js "path/to/your/image/folder"
```

**Example:**
```bash
node server.js "D:\MyDataset\Images"
```

#### 3. Open on your phone

The server prints a network URL on startup — open it on your phone's browser:

```
┌──────────────────────────────────────────────────────┐
│       🖼️  DeepAnnotate Server Running                │
├──────────────────────────────────────────────────────┤
│  📁 Root:  D:\MyDataset\Images                       │
│  📝 Annotations: D:\MyDataset\Images\annotations.json│
├──────────────────────────────────────────────────────┤
│  Local:   http://localhost:3001                       │
│  Network: http://192.168.1.42:3001                   │
└──────────────────────────────────────────────────────┘
```

> **Tip:** Your phone and desktop must be on the same Wi-Fi network.

### Development Mode

For development with hot-reload:

```bash
# Terminal 1 — Start the backend
node server.js "path/to/images"

# Terminal 2 — Start Vite dev server
npm run dev
```

The Vite dev server proxies `/api` requests to the backend automatically.

---

## 📖 Gesture Guide

| Gesture       | Action           |
|---------------|------------------|
| **Swipe →**   | Mark as **True** |
| **Swipe ←**   | Mark as **False**|
| **Swipe ↑**   | **Skip** image   |
| **Swipe ↓**   | Go **Back**      |
| **Pinch**     | Zoom in/out      |

---

## 🔌 API Reference

| Method   | Endpoint                          | Description                        |
|----------|-----------------------------------|------------------------------------|
| `GET`    | `/api/config`                     | Server configuration               |
| `GET`    | `/api/folders`                    | List folders with annotation counts|
| `GET`    | `/api/folders/:name/images`       | List images in a folder            |
| `GET`    | `/api/images/:folder/:filename`   | Serve an image file                |
| `GET`    | `/api/annotations`                | Get all annotations                |
| `POST`   | `/api/annotations`                | Save annotation `{ key, status }`  |
| `DELETE` | `/api/annotations`                | Reset all annotations              |

### Annotation Format

Annotations are stored as `annotations.json` in the root image folder:

```json
{
  "cats/img001.jpg": "true",
  "cats/img002.png": "false",
  "dogs/img003.jpg": "skip"
}
```

---

## 📁 Project Structure

```
phone_responsive_classification_annot_app/
├── server.js                  # Express backend (API + static serving)
├── index.html                 # Vite entry point
├── vite.config.js             # Vite config (proxy, host)
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── src/
│   ├── main.jsx               # React entry
│   ├── App.jsx                # Root component + context provider
│   ├── App.css                # App-level styles
│   ├── index.css              # Global styles + design tokens
│   ├── components/
│   │   ├── Dashboard.jsx      # Folder list + progress overview
│   │   ├── SubfolderView.jsx  # Image grid within a folder
│   │   └── AnnotationView.jsx # Gesture-driven annotation interface
│   └── assets/
├── dist/                      # Production build (gitignored)
└── public/                    # Static assets
```

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).
