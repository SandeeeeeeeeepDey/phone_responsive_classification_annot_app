import { useState, useEffect, useMemo, createContext, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, RefreshCw, WifiOff } from 'lucide-react';

import Dashboard from './components/Dashboard';
import SubfolderView from './components/SubfolderView';
import AnnotationView from './components/AnnotationView';

// ─── App Context ────────────────────────────────────────────────────────────────
const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

// ─── Loading Screen ─────────────────────────────────────────────────────────────
function LoadingScreen({ error }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass p-10 max-w-md w-full flex flex-col items-center"
      >
        {error ? (
          <>
            <WifiOff size={56} className="text-red-400 mb-6" />
            <h1 className="text-2xl font-bold text-white mb-3">Connection Failed</h1>
            <p className="text-slate-400 mb-6">
              Could not reach the backend server. Make sure it's running:
            </p>
            <code className="bg-slate-800 text-blue-300 px-4 py-3 rounded-xl text-sm block w-full text-left">
              node server.js "D:\path\to\images"
            </code>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary mt-8 w-full"
            >
              <RefreshCw size={18} /> Retry
            </button>
          </>
        ) : (
          <>
            <div className="mb-6 relative">
              <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
              <Layers size={56} className="text-white relative z-10" />
            </div>
            <h1 className="text-2xl font-bold text-gradient mb-3">DeepAnnotate</h1>
            <div className="flex items-center gap-3">
              <RefreshCw className="animate-spin text-blue-400" size={20} />
              <p className="text-slate-300">Connecting to server...</p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [foldersInfo, setFoldersInfo] = useState([]);
  const [folderImages, setFolderImages] = useState({});         // { folderName: [imageName, ...] }
  const [annotations, setAnnotations] = useState({});
  const [appLoading, setAppLoading] = useState(true);
  const [appError, setAppError] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const [pseudoLabels, setPseudoLabels] = useState({});

  // Navigation
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeFolder, setActiveFolder] = useState(null);

  // ─── Initial data fetch ─────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [foldersRes, annotationsRes, configRes, pseudoRes] = await Promise.all([
          fetch('/api/folders').then(r => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch('/api/annotations').then(r => r.json()),
          fetch('/api/config').then(r => r.json()),
          fetch('/api/pseudo-labels').then(r => r.json()).catch(() => ({})),
        ]);
        setFoldersInfo(foldersRes);
        setAnnotations(annotationsRes);
        setRootPath(configRes.rootPath);
        setPseudoLabels(pseudoRes);
      } catch (err) {
        console.error('Failed to connect to server:', err);
        setAppError(true);
      } finally {
        setAppLoading(false);
      }
    }
    init();
  }, []);

  // ─── Load images for a specific folder ──────────────────────────────────
  const loadFolderImages = useCallback(async (folderName) => {
    if (folderImages[folderName]) return folderImages[folderName];
    const images = await fetch(`/api/folders/${encodeURIComponent(folderName)}/images`).then(r => r.json());
    setFolderImages(prev => ({ ...prev, [folderName]: images }));
    return images;
  }, [folderImages]);

  // ─── Compute annotation counts per folder ───────────────────────────────
  const foldersWithCounts = useMemo(() => {
    return foldersInfo.map(folder => {
      const prefix = `${folder.name}/`;
      let annotatedCount = 0;
      for (const key in annotations) {
        if (key.startsWith(prefix) && annotations[key]) annotatedCount++;
      }
      return { ...folder, annotatedCount };
    });
  }, [foldersInfo, annotations]);

  // ─── Get image URL from server ──────────────────────────────────────────
  const getImageUrl = useCallback((folderName, imageName) => {
    return `/api/images/${encodeURIComponent(folderName)}/${encodeURIComponent(imageName)}`;
  }, []);

  // ─── Get loaded images for a folder ─────────────────────────────────────
  const getImagesForFolder = useCallback((folderName) => {
    return folderImages[folderName] || [];
  }, [folderImages]);

  // ─── Annotate an image (optimistic + save to server) ────────────────────
  const handleAnnotate = useCallback(async (fileKey, status) => {
    setAnnotations(prev => ({ ...prev, [fileKey]: status }));
    fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: fileKey, status }),
    }).catch(err => console.error('Failed to save annotation:', err));
  }, []);

  // ─── Reset all annotations ─────────────────────────────────────────────
  const resetProgress = useCallback(() => {
    if (confirm('Reset all annotations? This cannot be undone.')) {
      setAnnotations({});
      fetch('/api/annotations', { method: 'DELETE' })
        .catch(err => console.error('Failed to reset:', err));
    }
  }, []);

  // ─── Loading / Error states ─────────────────────────────────────────────
  if (appLoading || appError) {
    return <LoadingScreen error={appError} />;
  }

  const value = {
    foldersInfo: foldersWithCounts,
    annotations,
    activeFolder,
    setActiveFolder,
    currentView,
    setCurrentView,
    handleAnnotate,
    getImagesForFolder,
    getImageUrl,
    loadFolderImages,
    rootPath,
    pseudoLabels,
  };

  return (
    <AppContext.Provider value={value}>
      <div
        className="w-full h-[100dvh] overflow-hidden flex flex-col relative text-slate-100 bg-slate-950"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <AnimatePresence mode="wait">
          {currentView === 'dashboard' && <Dashboard key="dashboard" onReset={resetProgress} />}
          {currentView === 'folder' && <SubfolderView key="folder" />}
          {currentView === 'annotate' && <AnnotationView key="annotate" />}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  );
}
