import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';
import { useGesture } from '@use-gesture/react';
import { ChevronLeft, Check, X, SkipForward, RefreshCw, ZoomIn, Eye } from 'lucide-react';

export default function AnnotationView() {
  const {
    activeFolder, getImagesForFolder, loadFolderImages,
    setCurrentView, annotations, handleAnnotate, getImageUrl
  } = useAppContext();

  // ─── Image list ──────────────────────────────────────────────────────────
  const [allImages, setAllImages] = useState(getImagesForFolder(activeFolder));
  const [imagesReady, setImagesReady] = useState(allImages.length > 0);

  useEffect(() => {
    const existing = getImagesForFolder(activeFolder);
    if (existing.length > 0) {
      setAllImages(existing);
      setImagesReady(true);
      return;
    }
    loadFolderImages(activeFolder).then(imgs => {
      setAllImages(imgs);
      setImagesReady(true);
    });
  }, [activeFolder]);

  // ─── Find first unannotated image ────────────────────────────────────────
  const initialIndex = useMemo(() => {
    if (allImages.length === 0) return 0;
    const idx = allImages.findIndex(img => !annotations[`${activeFolder}/${img}`]);
    return idx === -1 ? 0 : idx;
    // intentionally only compute on allImages/activeFolder change, not on every annotation
  }, [allImages, activeFolder]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const hasSetInitial = useRef(false);

  // Set initial index only once when images become ready
  useEffect(() => {
    if (imagesReady && !hasSetInitial.current) {
      setCurrentIndex(initialIndex);
      hasSetInitial.current = true;
    }
  }, [imagesReady, initialIndex]);

  // ─── Image preloading (50 ahead, 20 behind) ─────────────────────────────
  // Separate initial loading from background preloading
  const [initialLoading, setInitialLoading] = useState(true);
  const [preloadProgress, setPreloadProgress] = useState({ loaded: 0, total: 0 });
  const preloadedSet = useRef(new Set());
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!imagesReady || allImages.length === 0) return;

    const start = Math.max(0, currentIndex - 20);
    const end = Math.min(allImages.length, currentIndex + 51);
    const windowImages = allImages.slice(start, end);
    const toPreload = windowImages.filter(img => !preloadedSet.current.has(img));

    if (toPreload.length === 0) {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setInitialLoading(false);
      }
      return;
    }

    // Show loading UI only for the first batch
    if (!initialLoadDone.current) {
      setPreloadProgress({ loaded: 0, total: toPreload.length });
    }

    let count = 0;
    const promises = toPreload.map(imgName => new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = () => {
        preloadedSet.current.add(imgName);
        count++;
        if (!initialLoadDone.current) {
          setPreloadProgress(p => ({ ...p, loaded: count }));
        }
        resolve();
      };
      img.src = getImageUrl(activeFolder, imgName);
    }));

    Promise.all(promises).then(() => {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setInitialLoading(false);
      }
    });
  }, [currentIndex, allImages, imagesReady, activeFolder, getImageUrl]);

  // ─── Current image info (always derived from latest state) ───────────────
  const currentImageName = allImages[currentIndex];
  const currentKey = currentImageName ? `${activeFolder}/${currentImageName}` : null;
  const currentUrl = currentImageName ? getImageUrl(activeFolder, currentImageName) : null;
  const currentStatus = currentKey ? (annotations[currentKey] || null) : null;

  // ─── Queue info for header ───────────────────────────────────────────────
  const pastCount = Math.min(currentIndex, 20);
  const futureCount = Math.min(allImages.length - currentIndex - 1, 50);

  // ─── Spring animation for drag/pinch ─────────────────────────────────────
  const [{ x, y, scale }, api] = useSpring(() => ({ x: 0, y: 0, scale: 1 }));

  // ─── Gesture feedback state ──────────────────────────────────────────────
  const [gestureFeedback, setGestureFeedback] = useState(null);

  // ─── Actions (use refs to avoid stale closures in gesture handler) ──────
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const allImagesRef = useRef(allImages);
  useEffect(() => { allImagesRef.current = allImages; }, [allImages]);

  const handleAnnotateRef = useRef(handleAnnotate);
  useEffect(() => { handleAnnotateRef.current = handleAnnotate; }, [handleAnnotate]);

  const [isRegistering, setIsRegistering] = useState(false);

  const doDecision = useCallback((status) => {
    const idx = currentIndexRef.current;
    const imgs = allImagesRef.current;
    const imgName = imgs[idx];
    if (!imgName) return;

    // Trigger visual registration feedback
    setIsRegistering(true);

    const key = `${activeFolder}/${imgName}`;
    handleAnnotateRef.current(key, status);

    // Short delay for the user to see the "registered" state pulse
    setTimeout(() => {
      setIsRegistering(false);
      if (idx < imgs.length - 1) {
        setCurrentIndex(idx + 1);
      } else {
        setTimeout(() => setCurrentView('folder'), 300);
      }
    }, 200);
  }, [activeFolder, setCurrentView]);

  const goBack = useCallback(() => {
    setIsRegistering(true);
    setTimeout(() => {
       setIsRegistering(false);
       setCurrentIndex(c => Math.max(0, c - 1));
    }, 200);
  }, []);

  // ─── Gesture handler ────────────────────────────────────────────────────
  const bind = useGesture({
    onDrag: (state) => {
      const { movement: [mx, my] } = state;
      const triggerThreshold = 100;

      // If zoomed in, allow panning instead of swiping
      if (scale.get() > 1 && !state.last) {
        api.start({ x: mx, y: my, immediate: true });
        return;
      }

      // Live gesture feedback
      if (!state.active) {
        setGestureFeedback(null);
      } else {
        if (my < -50 && Math.abs(mx) < 50) setGestureFeedback('skip');
        else if (my > 50 && Math.abs(mx) < 50) setGestureFeedback('back');
        else if (mx > 50 && Math.abs(my) < 50) setGestureFeedback('true');
        else if (mx < -50 && Math.abs(my) < 50) setGestureFeedback('false');
        else setGestureFeedback(null);
      }

      if (state.last) {
        setGestureFeedback(null);
        let acted = false;

        if (Math.abs(mx) > triggerThreshold && Math.abs(mx) > Math.abs(my)) {
          if (mx > 0) { doDecision('true'); acted = true; }
          else { doDecision('false'); acted = true; }
        } else if (Math.abs(my) > triggerThreshold && Math.abs(my) > Math.abs(mx)) {
          if (my < 0) { doDecision('skip'); acted = true; }
          else { goBack(); acted = true; }
        }

        api.start({ x: 0, y: 0, scale: acted ? 1 : scale.get(), immediate: false });
        return;
      }

      if (scale.get() <= 1) {
        api.start({ x: state.active ? mx : 0, y: state.active ? my : 0, immediate: state.active });
      }
    },
    onPinch: ({ offset: [s] }) => {
      api.start({ scale: s });
    },
  }, {
    drag: { filterTaps: true },
    pinch: { scaleBounds: { min: 1, max: 5 }, rubberband: true },
  });

  // ─── Render ──────────────────────────────────────────────────────────────
  if (!imagesReady) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-950">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={40} />
        <p className="text-slate-300">Loading folder data...</p>
      </div>
    );
  }

  // Status badge color/icon/label
  const getStatusInfo = (status) => {
    switch (status) {
      case 'true':  return { icon: <Check size={20} />, label: 'TRUE',    color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/40' };
      case 'false': return { icon: <X size={20} />,     label: 'FALSE',   color: 'text-red-400',   bg: 'bg-red-500/20',   border: 'border-red-500/40' };
      case 'skip':  return { icon: <SkipForward size={20} />, label: 'SKIPPED', color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/40' };
      default:      return { icon: <Eye size={20} />,   label: 'NEW',     color: 'text-blue-400',  bg: 'bg-blue-500/20',  border: 'border-blue-500/40' };
    }
  };

  const statusInfo = getStatusInfo(currentStatus);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex flex-col h-[100dvh] bg-slate-950 absolute inset-0 z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 z-20 bg-gradient-to-b from-slate-950 to-transparent">
        <button
          onClick={() => setCurrentView('folder')}
          className="p-2 rounded-full hover:bg-slate-800 text-slate-300"
        >
          <ChevronLeft size={28} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs text-slate-400 font-medium">
            IMAGE {currentIndex + 1} OF {allImages.length}
          </span>
          <span className="text-xs text-blue-400 tracking-wider">
            {initialLoading
              ? `CACHING ${preloadProgress.loaded}/${preloadProgress.total}...`
              : `${pastCount} PAST · ${futureCount} NEXT CACHED`
            }
          </span>
        </div>
        {/* Status badge in header */}
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${statusInfo.bg} ${statusInfo.color} ${statusInfo.border} border`}>
          {statusInfo.icon}
        </div>
      </div>

      {/* Main Annotation Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden w-full h-full p-4">

        {/* Always render the image once initial loading is done */}
        {!initialLoading && currentUrl && (
          <animated.div
            key={currentIndex}
            {...bind()}
            style={{ 
              x, y, 
              scale: isRegistering ? 0.95 : scale, 
              opacity: isRegistering ? 0.8 : 1,
              touchAction: 'none' 
            }}
            className={`w-full h-full max-h-[70vh] rounded-2xl overflow-hidden glass shadow-2xl relative select-none will-change-transform transition-colors duration-200 ${isRegistering ? 'ring-4 ring-white/50' : ''}`}
          >
            {/* Registration Flash Overlay */}
            <AnimatePresence>
              {isRegistering && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/20 z-50 pointer-events-none"
                />
              )}
            </AnimatePresence>

            <img
              src={currentUrl}
              alt={currentImageName}
              className="w-full h-full object-contain bg-slate-900 pointer-events-none"
              draggable="false"
            />

            {/* Status overlay for annotated images */}
            {currentStatus && (
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
                {currentStatus === 'true' && <Check size={80} className="text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)] mb-4" />}
                {currentStatus === 'false' && <X size={80} className="text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] mb-4" />}
                {currentStatus === 'skip' && <SkipForward size={80} className="text-slate-300 drop-shadow-[0_0_15px_rgba(203,213,225,0.5)] mb-4" />}
                <p className="text-xl font-bold uppercase tracking-wider text-white">
                  {currentStatus === 'true' ? 'Marked True' : currentStatus === 'false' ? 'Marked False' : 'Skipped'}
                </p>
                <p className="text-slate-300 mt-2">Swipe again to change, or swipe down to go back.</p>
              </div>
            )}

            {/* Gesture feedback overlays */}
            <AnimatePresence>
              {gestureFeedback === 'true' && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }} 
                  animate={{ 
                    opacity: Math.min(Math.abs(x.get()) / 100, 1),
                    x: 0,
                    scale: Math.abs(x.get()) >= 100 ? 1.2 : 1
                  }} 
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-green-500/40 to-transparent flex items-center justify-end pr-12 pointer-events-none z-20"
                >
                  <div className="flex flex-col items-center">
                    <div className={`p-4 rounded-full ${Math.abs(x.get()) >= 100 ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]' : 'bg-green-500/20'} transition-all duration-200`}>
                      <Check size={48} className="text-white drop-shadow-md" />
                    </div>
                    <span className="text-white font-bold tracking-widest mt-4 uppercase text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                      {Math.abs(x.get()) >= 100 ? 'RELEASE TO CONFIRM' : 'SWIPE TO APPROVE'}
                    </span>
                  </div>
                </motion.div>
              )}
              {gestureFeedback === 'false' && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }} 
                  animate={{ 
                    opacity: Math.min(Math.abs(x.get()) / 100, 1),
                    x: 0,
                    scale: Math.abs(x.get()) >= 100 ? 1.2 : 1
                  }} 
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-red-500/40 to-transparent flex items-center justify-start pl-12 pointer-events-none z-20"
                >
                  <div className="flex flex-col items-center">
                    <div className={`p-4 rounded-full ${Math.abs(x.get()) >= 100 ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]' : 'bg-red-500/20'} transition-all duration-200`}>
                      <X size={48} className="text-white drop-shadow-md" />
                    </div>
                    <span className="text-white font-bold tracking-widest mt-4 uppercase text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                      {Math.abs(x.get()) >= 100 ? 'RELEASE TO REJECT' : 'SWIPE TO REJECT'}
                    </span>
                  </div>
                </motion.div>
              )}
              {gestureFeedback === 'skip' && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }} 
                  animate={{ 
                    opacity: Math.min(Math.abs(y.get()) / 100, 1),
                    y: 0,
                    scale: Math.abs(y.get()) >= 100 ? 1.2 : 1
                  }} 
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-slate-500/40 to-transparent flex flex-col justify-start pt-12 items-center pointer-events-none z-20"
                >
                  <div className={`p-4 rounded-full ${Math.abs(y.get()) >= 100 ? 'bg-slate-400 shadow-[0_0_20px_rgba(148,163,184,0.6)]' : 'bg-slate-500/20'} transition-all duration-200`}>
                    <SkipForward size={48} className="text-white drop-shadow-md" />
                  </div>
                  <span className="text-white font-bold tracking-widest mt-4 uppercase text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                    {Math.abs(y.get()) >= 100 ? 'RELEASE TO SKIP' : 'SWIPE UP TO SKIP'}
                  </span>
                </motion.div>
              )}
              {gestureFeedback === 'back' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ 
                    opacity: Math.min(Math.abs(y.get()) / 100, 1),
                    y: 0,
                    scale: Math.abs(y.get()) >= 100 ? 1.2 : 1
                  }} 
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-500/40 to-transparent flex flex-col justify-end pb-12 items-center pointer-events-none z-20"
                >
                   <span className="text-white font-bold tracking-widest mb-4 uppercase text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                    {Math.abs(y.get()) >= 100 ? 'RELEASE FOR PREVIOUS' : 'SWIPE DOWN FOR PREVIOUS'}
                  </span>
                  <div className={`p-4 rounded-full ${Math.abs(y.get()) >= 100 ? 'bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)]' : 'bg-blue-500/20'} transition-all duration-200`}>
                    <ChevronLeft size={48} className="rotate-90 text-white drop-shadow-md" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Threshold Indicators (Visual Cues for Region) */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-4 z-10">
               <div className={`w-1 h-20 rounded-full transition-all duration-300 ${Math.abs(x.get()) > 50 && x.get() < 0 ? 'bg-red-500/50 scale-y-125' : 'bg-white/10'}`} />
               <div className={`w-1 h-20 rounded-full transition-all duration-300 ${Math.abs(x.get()) > 50 && x.get() > 0 ? 'bg-green-500/50 scale-y-125' : 'bg-white/10'}`} />
            </div>
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between py-4 z-10">
               <div className={`h-1 w-20 rounded-full transition-all duration-300 ${Math.abs(y.get()) > 50 && y.get() < 0 ? 'bg-slate-400/50 scale-x-125' : 'bg-white/10'}`} />
               <div className={`h-1 w-20 rounded-full transition-all duration-300 ${Math.abs(y.get()) > 50 && y.get() > 0 ? 'bg-blue-400/50 scale-x-125' : 'bg-white/10'}`} />
            </div>
          </animated.div>
        )}

        {/* Initial loading overlay (only shown once) */}
        <AnimatePresence>
          {initialLoading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col justify-center items-center z-30 bg-slate-950"
            >
              <RefreshCw className="animate-spin text-blue-500 mb-4" size={40} />
              <p className="text-blue-200 font-medium tracking-wide mb-3">CACHING IMAGES...</p>
              <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200 rounded-full"
                  style={{
                    width: preloadProgress.total
                      ? `${Math.round((preloadProgress.loaded / preloadProgress.total) * 100)}%`
                      : '0%'
                  }}
                />
              </div>
              <p className="text-slate-400 text-xs mt-2">
                {preloadProgress.loaded} / {preloadProgress.total} images
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar above footer */}
      <div className={`mx-4 mb-2 flex items-center justify-center gap-2 py-2 px-4 rounded-xl border ${statusInfo.bg} ${statusInfo.border}`}>
        <span className={`${statusInfo.color} flex items-center gap-2 font-bold text-sm tracking-wider`}>
          {statusInfo.icon} {statusInfo.label}
        </span>
      </div>

      {/* Guide Footer */}
      <div className="h-20 bg-slate-900/80 backdrop-blur-lg border-t border-slate-800 flex items-center justify-around px-2 pb-safe">
        <div className="flex flex-col items-center opacity-70">
          <ChevronLeft size={20} className="mb-1 text-red-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider">False</span>
        </div>
        <div className="flex flex-col items-center opacity-70">
          <Check size={20} className="mb-1 text-green-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider">True</span>
        </div>
        <div className="flex flex-col items-center opacity-70">
          <SkipForward size={20} className="mb-1 text-slate-300" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Skip (Up)</span>
        </div>
        <div className="flex flex-col items-center opacity-70">
          <ZoomIn size={20} className="mb-1 text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Pinch</span>
        </div>
      </div>
    </motion.div>
  );
}
