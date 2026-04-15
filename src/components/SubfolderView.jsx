import { useState, useEffect } from 'react';
import { useAppContext } from '../App';
import { motion } from 'framer-motion';
import { ChevronLeft, Play, Check, X, SkipForward, AlertCircle, RefreshCw } from 'lucide-react';

export default function SubfolderView() {
  const {
    activeFolder, getImagesForFolder, loadFolderImages,
    setCurrentView, annotations, getImageUrl
  } = useAppContext();

  const [images, setImages] = useState(getImagesForFolder(activeFolder));
  const [loading, setLoading] = useState(images.length === 0);

  // Load images for this folder if not already loaded
  useEffect(() => {
    const existing = getImagesForFolder(activeFolder);
    if (existing.length > 0) {
      setImages(existing);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadFolderImages(activeFolder).then(imgs => {
      setImages(imgs);
      setLoading(false);
    });
  }, [activeFolder]);

  // Calculate per-status counts
  const statusCounts = images.reduce((acc, img) => {
    const status = annotations[`${activeFolder}/${img}`];
    if (status === 'true') acc.trueCount++;
    else if (status === 'false') acc.falseCount++;
    else if (status === 'skip') acc.skipCount++;
    else acc.newCount++;
    return acc;
  }, { trueCount: 0, falseCount: 0, skipCount: 0, newCount: 0 });

  const annotatedCount = statusCounts.trueCount + statusCounts.falseCount + statusCounts.skipCount;
  const progressPercent = images.length ? Math.round((annotatedCount / images.length) * 100) : 0;

  // Show first 30 thumbnails
  const displayImages = images.slice(0, 30);

  // Display name (handle _root virtual folder)
  const displayName = activeFolder === '_root' ? 'Root Images' : activeFolder;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full bg-slate-950 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-300 transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
        <h2 className="text-xl font-bold text-white truncate max-w-[200px]">{displayName}</h2>
        <div className="w-10"></div>
      </div>

      {/* Progress Card */}
      <div className="glass p-5 mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500 rounded-full blur-3xl opacity-20"></div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-slate-300">Folder Progress</span>
          <span className="text-lg font-bold text-white text-gradient">{progressPercent}%</span>
        </div>
        <div className="progress-container bg-slate-800 mb-3">
          <div
            className="progress-fill shadow-[0_0_10px_rgba(168,85,247,0.5)]"
            style={{ width: `${progressPercent}%`, backgroundImage: 'var(--accent-gradient)' }}
          ></div>
        </div>
        <p className="text-sm text-slate-400 mb-3">
          {annotatedCount} of {images.length} images annotated
        </p>

        {/* Status Legend */}
        <div className="grid grid-cols-4 gap-2">
          <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0"></span>
            <span className="text-xs text-green-300 font-medium">{statusCounts.trueCount}</span>
            <span className="text-[10px] text-slate-500">True</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0"></span>
            <span className="text-xs text-red-300 font-medium">{statusCounts.falseCount}</span>
            <span className="text-[10px] text-slate-500">False</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0"></span>
            <span className="text-xs text-slate-300 font-medium">{statusCounts.skipCount}</span>
            <span className="text-[10px] text-slate-500">Skip</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-2 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0"></span>
            <span className="text-xs text-blue-300 font-medium">{statusCounts.newCount}</span>
            <span className="text-[10px] text-slate-500">New</span>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={() => setCurrentView('annotate')}
        disabled={loading}
        className="btn btn-primary w-full py-4 text-lg mb-6 shadow-lg shadow-purple-500/20 disabled:opacity-50"
      >
        {loading ? (
          <><RefreshCw size={20} className="animate-spin" /> Loading...</>
        ) : (
          <><Play size={20} fill="currentColor" /> Start Annotating</>
        )}
      </button>

      {/* Thumbnail Grid Header */}
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle size={16} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Preview ({Math.min(displayImages.length, 30)} of {images.length})
        </h3>
      </div>

      {/* Thumbnail Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="animate-spin text-blue-400" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 overflow-y-auto pb-6">
          {displayImages.map((imageName) => {
            const fileKey = `${activeFolder}/${imageName}`;
            const status = annotations[fileKey];

            // Color-coded border & dot based on annotation status
            const borderColor = status === 'true'
              ? 'border-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]'
              : status === 'false'
              ? 'border-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]'
              : status === 'skip'
              ? 'border-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.3)]'
              : 'border-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.4)]';

            const dotColor = status === 'true'
              ? 'bg-green-400'
              : status === 'false'
              ? 'bg-red-400'
              : status === 'skip'
              ? 'bg-slate-400'
              : 'bg-blue-400';

            const statusLabel = status === 'true'
              ? 'True'
              : status === 'false'
              ? 'False'
              : status === 'skip'
              ? 'Skip'
              : 'New';

            return (
              <div
                key={fileKey}
                className={`aspect-square bg-slate-900 rounded-lg overflow-hidden relative border-[3px] ${borderColor} transition-all duration-200`}
              >
                <img
                  src={getImageUrl(activeFolder, imageName)}
                  alt={imageName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                {/* Status badge */}
                <div className={`absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-sm`}>
                  <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                  <span className="text-[10px] font-semibold text-white leading-none">{statusLabel}</span>
                </div>

                {/* Overlay icon for annotated images */}
                {status && (
                  <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                    {status === 'true' && <Check size={28} className="text-green-400 drop-shadow-md" />}
                    {status === 'false' && <X size={28} className="text-red-400 drop-shadow-md" />}
                    {status === 'skip' && <SkipForward size={24} className="text-slate-300 drop-shadow-md" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
