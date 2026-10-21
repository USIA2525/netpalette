import { useState, useMemo } from 'react';
import { X, Search, BookOpen, Calculator } from 'lucide-react';
import { DictionaryTerm, extendedNetworkDictionary } from "../data/dictionary";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
};

export default function DictionaryModal({ isOpen, onClose, isDarkMode }: Props) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDict = useMemo(() => {
    if (!searchTerm) return extendedNetworkDictionary;
    const lowerQuery = searchTerm.toLowerCase();
    return extendedNetworkDictionary.filter((item: DictionaryTerm) => 
      item.term.toLowerCase().includes(lowerQuery) || 
      item.definition.toLowerCase().includes(lowerQuery) ||
      item.reading.includes(lowerQuery)
    );
  }, [searchTerm]);

  const groupedDict = useMemo(() => {
    const groups: Record<string, DictionaryTerm[]> = {};
    filteredDict.forEach((item: DictionaryTerm) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredDict]);

  if (!isOpen) return null;

  const bgModal = isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const textDesc = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const inputBg = isDarkMode ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`w-full max-w-4xl max-h-[85vh] rounded-xl border shadow-2xl flex flex-col ${bgModal}`}>
        
        {/* ヘッダー */}
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <h2 className={`text-lg font-bold flex items-center gap-2 ${textTitle}`}>
            <BookOpen size={20} className="text-blue-500"/> ネットワーク用語・計算 辞書
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
            <X size={20} />
          </button>
        </div>

        {/* 検索バー */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="用語や意味で検索..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-500/50 ${inputBg}`} 
            />
          </div>
        </div>

        {/* 辞書リスト */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.keys(groupedDict).length === 0 ? (
            <div className="text-center py-10 text-slate-400">一致する用語が見つかりません。</div>
          ) : (
            Object.keys(groupedDict).map(category => (
              <div key={category}>
                <h3 className={`text-sm font-bold mb-3 px-2 border-l-4 border-blue-500 ${textTitle}`}>{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupedDict[category].map((item: DictionaryTerm) => (
                    <div key={item.id} className={`p-4 rounded-lg border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-baseline justify-between mb-1">
                        <h4 className={`font-bold text-[15px] ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>{item.term}</h4>
                        <span className="text-[10px] text-slate-400">{item.reading}</span>
                      </div>
                      <p className={`text-xs font-bold mb-2 ${textTitle}`}>{item.definition}</p>
                      {item.details && <p className={`text-[11px] leading-relaxed mb-3 ${textDesc}`}>{item.details}</p>}
                      
                      {item.calculation && (
                        <div className={`mt-2 p-3 rounded-md border text-[11px] font-mono whitespace-pre-wrap ${isDarkMode ? 'bg-[#020617] border-slate-700 text-slate-300' : 'bg-blue-50 border-blue-100 text-slate-700'}`}>
                          <div className="flex items-center gap-1 mb-1 font-bold text-blue-500"><Calculator size={12}/> 計算方法</div>
                          {item.calculation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}