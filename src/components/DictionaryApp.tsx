import React, { useState, useMemo, useEffect } from 'react';
import { Search, BookOpen, Star, Brain, Calculator as CalcIcon, X } from 'lucide-react';
import { extendedNetworkDictionary } from '../data/dictionary';
import { SubnetCalculator } from './SubnetCalculator';

// ハイライト用の補助コンポーネント
const HighlightText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) return <>{text}</>;
  // 検索文字列をエスケープ処理
  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-300 dark:bg-yellow-600/60 text-slate-900 dark:text-white rounded px-1">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

export const DictionaryApp: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('すべて');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isMemorizeMode, setIsMemorizeMode] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  
  // localStorageからお気に入りを初期化
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('network-dict-favorites');
    return saved ? JSON.parse(saved) : [];
  });

  // お気に入りが変更されたらlocalStorageを更新
  useEffect(() => {
    localStorage.setItem('network-dict-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((fId) => fId !== id) : [...prev, id]
    );
  };

  // カテゴリ一覧を動的に生成
  const categories = useMemo(() => {
    const cats = Array.from(new Set(extendedNetworkDictionary.map((t) => t.category)));
    return ['すべて', ...cats];
  }, []);

  // 絞り込み処理
  const filteredTerms = useMemo(() => {
    return extendedNetworkDictionary.filter((term) => {
      const matchQuery =
        term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
        term.reading.includes(searchQuery) ||
        term.definition.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCategory = selectedCategory === 'すべて' || term.category === selectedCategory;
      const matchFavorite = !showFavoritesOnly || favorites.includes(term.id);

      return matchQuery && matchCategory && matchFavorite;
    });
  }, [searchQuery, selectedCategory, showFavoritesOnly, favorites]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* ヘッダー領域 */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h1 className="text-3xl font-extrabold flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              ITネットワーク用語辞典
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCalculator(!showCalculator)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${
                  showCalculator 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <CalcIcon className="w-5 h-5" />
                <span className="hidden sm:inline">計算機</span>
              </button>
            </div>
          </div>

          {/* 検索・絞り込みコントロール領域 */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="用語や説明文で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              <div className="w-full md:w-64">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 学習用トグルボタン群 */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  showFavoritesOnly
                    ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-400'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                ★ お気に入りのみ ({favorites.length})
              </button>
              
              <button
                onClick={() => setIsMemorizeMode(!isMemorizeMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                  isMemorizeMode
                    ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-400'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Brain className="w-4 h-4" />
                暗記モード (タップで表示)
              </button>
            </div>
          </div>
        </header>

        {/* サブネット計算機 (トグル表示) */}
        {showCalculator && <SubnetCalculator />}

        {/* 用語一覧領域 */}
        <div className="space-y-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium px-1">
            {filteredTerms.length} 件の用語が見つかりました
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTerms.map((term) => (
              <div
                key={term.id}
                className="group bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col h-full"
              >
                {/* お気に入りボタン */}
                <button
                  onClick={() => toggleFavorite(term.id)}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors z-10"
                >
                  <Star
                    className={`w-5 h-5 ${
                      favorites.includes(term.id)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-slate-300 dark:text-slate-600 group-hover:text-yellow-400'
                    }`}
                  />
                </button>

                <div className="mb-3 pr-10">
                  <span className="inline-block px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded mb-2">
                    {term.category}
                  </span>
                  
                  {/* 暗記モード: 用語名を隠す */}
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                    {isMemorizeMode ? (
                      <span className="bg-slate-800 dark:bg-slate-200 text-transparent hover:text-slate-100 dark:hover:text-slate-800 transition-colors cursor-pointer rounded px-2 select-none">
                        {term.term}
                      </span>
                    ) : (
                      <HighlightText text={term.term} highlight={searchQuery} />
                    )}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{term.reading}</p>
                </div>

                <div className="flex-1 mt-2 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 border-b border-slate-100 dark:border-slate-700 pb-1">
                      意味
                    </p>
                    {/* 暗記モード時は説明文も隠せるようにするかは要件次第ですが、今回はそのまま表示して用語名を当てる想定 */}
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                      <HighlightText text={term.definition} highlight={searchQuery} />
                    </p>
                  </div>

                  {term.details && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">詳細・補足</p>
                      <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                        <HighlightText text={term.details} highlight={searchQuery} />
                      </p>
                    </div>
                  )}

                  {term.calculation && (
                    <div className="bg-blue-50/50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                        <CalcIcon className="w-3 h-3" />
                        計算方法
                      </p>
                      <pre className="text-slate-700 dark:text-slate-300 text-xs whitespace-pre-wrap font-mono">
                        <HighlightText text={term.calculation} highlight={searchQuery} />
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {filteredTerms.length === 0 && (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-600 dark:text-slate-400">一致する用語がありません</p>
              <p className="text-slate-500 dark:text-slate-500 mt-2">検索条件やカテゴリを変更してみてください。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};