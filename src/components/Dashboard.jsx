import { useAppContext } from '../App';
import { motion } from 'framer-motion';
import { Folder, Play, CheckCircle2, ChevronRight, Layers } from 'lucide-react';

export default function Dashboard({ onReset }) {
  const { foldersInfo, setActiveFolder, setCurrentView } = useAppContext();

  const handleOpenFolder = (folderName) => {
    setActiveFolder(folderName);
    setCurrentView('folder');
  };

  const totalFiles = foldersInfo.reduce((acc, f) => acc + f.totalCount, 0);
  const totalAnnotated = foldersInfo.reduce((acc, f) => acc + f.annotatedCount, 0);
  const overallProgress = totalFiles ? Math.round((totalAnnotated / totalFiles) * 100) : 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full bg-slate-950 p-4 overflow-y-auto"
    >
      <div className="flex items-center justify-between mt-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Dashboard</h1>
          <p className="text-slate-400">Track your annotation progress</p>
        </div>
        <button className="bg-slate-800 text-white p-3 rounded-full hover:bg-slate-700 active:scale-95 transition-transform">
          <Layers size={24} />
        </button>
      </div>

      <div className="glass p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-blue-500 rounded-full blur-3xl opacity-20"></div>
        <div className="flex justify-between items-end mb-4 relative z-10">
          <div>
            <p className="text-sm text-slate-400 font-medium mb-1">Overall Progress</p>
            <div className="text-4xl font-bold text-white">{overallProgress}%</div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400 mb-1">Total Annotated</p>
            <div className="text-xl font-semibold text-white">{totalAnnotated} / {totalFiles}</div>
          </div>
        </div>
        <div className="progress-container bg-slate-800 relative z-10">
          <div className="progress-fill shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${overallProgress}%` }}></div>
        </div>
        
        {totalAnnotated > 0 && (
          <button 
            onClick={onReset}
            className="mt-6 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Reset All Annotations
          </button>
        )}
      </div>

      <h2 className="text-xl font-semibold text-white mb-4">Folders ({foldersInfo.length})</h2>
      
      <div className="grid gap-4 pb-20">
        {foldersInfo.map((folder, index) => {
          const progress = folder.totalCount ? Math.round((folder.annotatedCount / folder.totalCount) * 100) : 0;
          const isComplete = folder.annotatedCount === folder.totalCount && folder.totalCount > 0;

          return (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={folder.name}
              onClick={() => handleOpenFolder(folder.name)}
              className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-slate-800 hover:border-slate-700 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className={`p-3 rounded-xl ${isComplete ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {isComplete ? <CheckCircle2 size={24} /> : <Folder size={24} />}
                </div>
                <div className="flex-1 pr-4">
                  <h3 className="text-lg font-medium text-white mb-1 truncate">{folder.displayName || folder.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">{folder.annotatedCount} / {folder.totalCount} files</span>
                    <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">{progress}%</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="text-slate-500" />
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
