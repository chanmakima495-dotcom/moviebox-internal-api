'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { movieApi } from '@/lib/api';
import { 
  Clock, Star, Play, ChevronRight, Film, Sparkles, 
  Search, TrendingUp, Tv, Compass, Flame, Heart, 
  Trash2, RefreshCw, Layers, ShieldCheck, Zap
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  
  // Data States
  const [heroBanners, setHeroBanners] = useState<any[]>([]);
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);
  const [homeSections, setHomeSections] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [topRankings, setTopRankings] = useState<any[]>([]);
  
  // UI & Filter States
  const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'anime' | 'kids' | 'western'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHomeData();
  }, [activeTab]);

  // Auto Slider for Hero Banner
  useEffect(() => {
    if (heroBanners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveBannerIdx((prev) => (prev + 1) % heroBanners.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [heroBanners]);

  const loadHomeData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Dynamic Catalog Based on Active Tab
      let catalogRes: any = null;
      if (activeTab === 'movies') catalogRes = await movieApi.getMovies(1);
      else if (activeTab === 'anime') catalogRes = await movieApi.getAnime(1);
      else if (activeTab === 'kids') catalogRes = await movieApi.getKids(1);
      else if (activeTab === 'western') catalogRes = await movieApi.getWestern(1);
      else catalogRes = await movieApi.getHome(1);

      const sections = catalogRes?.data?.list || [];
      setHomeSections(sections);

      // Extract Hero Banners from first section
      if (sections.length > 0 && sections[0]?.items) {
        setHeroBanners(sections[0].items.slice(0, 5));
      }

      // 2. Fetch Continue Watching (API + LocalStorage Fallback)
      let historyItems: any[] = [];
      try {
        const histRes = await movieApi.getHistory(1);
        historyItems = histRes?.data?.list || [];
      } catch (e) {}

      if (!historyItems || historyItems.length === 0) {
        if (typeof window !== 'undefined') {
          const localHist = localStorage.getItem('user_history');
          if (localHist) historyItems = JSON.parse(localHist);
        }
      }
      
      if (!historyItems || historyItems.length === 0) {
        if (sections.length > 0 && sections[0]?.items) {
           historyItems = sections[0].items.slice(0, 4);
        }
      }
      setContinueWatching(historyItems);

      // 3. Fetch Watchlist (API + LocalStorage Fallback)
      let wlItems: any[] = [];
      try {
        const wlRes = await movieApi.getWatchlist(1);
        wlItems = wlRes?.data?.list || [];
      } catch (e) {}

      if (!wlItems || wlItems.length === 0) {
        if (typeof window !== 'undefined') {
          const localWl = localStorage.getItem('user_watchlist');
          if (localWl) wlItems = JSON.parse(localWl);
        }
      }

      if (!wlItems || wlItems.length === 0) {
        if (sections.length > 1 && sections[1]?.items) {
           wlItems = sections[1].items.slice(0, 6);
        } else if (sections.length > 0 && sections[0]?.items) {
           wlItems = sections[0].items.slice(4, 10);
        }
      }
      setWatchlist(wlItems);

      // 4. Fetch Top Rankings
      try {
        const rankRes = await movieApi.getRankings(1);
        const rankList = rankRes?.data?.[0]?.items || [];
        setTopRankings(rankList);
      } catch (e) {}

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await movieApi.search(query, 1);
      setSearchResults(res?.data?.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const clearHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await movieApi.deleteHistoryItem(id);
      setContinueWatching((prev) => prev.filter((item) => (item.subjectId || item.id) !== id));
      if (typeof window !== 'undefined') {
        const localHist = localStorage.getItem('user_history');
        if (localHist) {
          const parsed = JSON.parse(localHist).filter((x: any) => (x.subjectId || x.id) !== id);
          localStorage.setItem('user_history', JSON.stringify(parsed));
        }
      }
    } catch (e) {}
  };

  const navigateToMovie = (item: any) => {
    const targetId = item?.subjectId || item?.id;
    if (targetId) {
      router.push(`/detail/${targetId}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white select-none font-sans pb-32 overflow-x-hidden">
      
      {/* 1. Header with Search and Branding */}
      <header className="sticky top-0 z-50 bg-[#07090e]/90 backdrop-blur-xl border-b border-white/5 px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
               <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center shadow-lg shadow-red-600/30">
                  <Play className="w-5 h-5 fill-white" />
               </div>
               <div>
                  <h1 className="text-lg font-black italic uppercase tracking-tighter leading-none">ANIMEX <span className="text-red-500">PRO</span></h1>
                  <span className="text-[9px] font-bold tracking-widest text-zinc-400 uppercase">STREAM HQ</span>
               </div>
            </div>

            <div className="flex md:hidden items-center gap-2">
               <button 
                 onClick={() => { setRefreshing(true); loadHomeData(); }}
                 className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10"
               >
                  <RefreshCw className={`w-4 h-4 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
               </button>
               <button 
                 onClick={() => router.push('/profile')}
                 className="p-2.5 bg-gradient-to-r from-red-600 to-amber-500 rounded-xl text-black font-black text-xs"
               >
                  VIP
               </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-96">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
             <input 
               type="text"
               value={searchQuery}
               onChange={(e) => handleSearch(e.target.value)}
               placeholder="Search anime, movies, series..."
               className="w-full bg-[#12141a] border border-zinc-800 rounded-2xl pl-11 pr-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors"
             />
             {searchQuery && (
                <button 
                  onClick={() => handleSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold bg-zinc-800 px-2 py-0.5 rounded-full"
                >
                   ESC
                </button>
             )}
          </div>

          {/* Desktop Right Pill */}
          <div className="hidden md:flex items-center gap-3">
             <button 
               onClick={() => { setRefreshing(true); loadHomeData(); }}
               className="p-3 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors"
             >
                <RefreshCw className={`w-4 h-4 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
             </button>
             <button 
               onClick={() => router.push('/profile')}
               className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-red-600 rounded-2xl text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-red-600/30 hover:scale-105 transition-all"
             >
                ACCOUNT VIP
             </button>
          </div>

        </div>

        {/* Category Pills Bar */}
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar pt-4">
           {[
             { id: 'all', label: 'All Feeds' },
             { id: 'movies', label: 'Movies' },
             { id: 'anime', label: 'Anime Hub' },
             { id: 'kids', label: 'Kids & Family' },
             { id: 'western', label: 'Western Collection' }
           ].map((tab) => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 border border-red-500' 
                    : 'bg-[#12141a] text-zinc-400 border border-zinc-800/80 hover:text-white hover:bg-[#1a1d26]'
               }`}
             >
                {tab.label}
             </button>
           ))}
        </div>
      </header>

      {/* Real-Time Search Results Overlay */}
      {isSearching ? (
         <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4">
               Search Results for "{searchQuery}" ({searchResults.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
               {searchResults.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => navigateToMovie(item)}
                    className="bg-[#12141a] rounded-2xl border border-zinc-800 overflow-hidden hover:border-red-500 transition-all cursor-pointer group"
                  >
                     <div className="relative aspect-[2/3] w-full bg-zinc-900 overflow-hidden">
                        <img src={item.poster || item.cover} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-black text-amber-400">
                           ★ {item.score || '8.5'}
                        </div>
                     </div>
                     <div className="p-3">
                        <h3 className="font-bold text-xs truncate text-zinc-200">{item.title}</h3>
                        <p className="text-[10px] text-zinc-500">{item.releaseTime || 'Movie'}</p>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-12 mt-6">

          {/* 2. Hero Interactive Spotlight Banner */}
          {heroBanners.length > 0 && (
             <div className="relative w-full aspect-[21/9] min-h-[260px] md:min-h-[380px] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl group">
                <img 
                  src={heroBanners[activeBannerIdx]?.cover || heroBanners[activeBannerIdx]?.poster} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/50 to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07090e] via-[#07090e]/70 to-transparent z-10" />

                <div className="relative z-20 h-full flex flex-col justify-end p-6 md:p-12 max-w-2xl space-y-3 md:space-y-4">
                   <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-red-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-600/50">
                         FEATURED SPOTLIGHT
                      </span>
                      <span className="text-amber-400 font-bold text-xs flex items-center gap-1">
                         <Star className="w-3.5 h-3.5 fill-amber-400" />
                         {heroBanners[activeBannerIdx]?.score || '9.4'}
                      </span>
                   </div>
                   <h2 className="text-2xl md:text-5xl font-black italic uppercase tracking-tighter text-white drop-shadow-md truncate">
                      {heroBanners[activeBannerIdx]?.title}
                   </h2>
                   <p className="text-xs md:text-sm text-zinc-300 line-clamp-2 leading-relaxed">
                      {heroBanners[activeBannerIdx]?.description || 'Experience ultra-high bitrate streaming with lossless multi-language audio tracks.'}
                   </p>
                   <div className="flex items-center gap-3 pt-2">
                      <button 
                        onClick={() => navigateToMovie(heroBanners[activeBannerIdx])}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-red-600 hover:text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl hover:scale-105 active:scale-95"
                      >
                         <Play className="w-4 h-4 fill-current" /> Watch Now
                      </button>
                      <button 
                        onClick={() => navigateToMovie(heroBanners[activeBannerIdx])}
                        className="px-4 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-xs font-bold transition-all"
                      >
                         Details
                      </button>
                   </div>
                </div>

                {/* Banner Indicators */}
                <div className="absolute bottom-6 right-6 z-20 flex gap-2">
                   {heroBanners.map((_, i) => (
                      <div 
                        key={i} 
                        onClick={() => setActiveBannerIdx(i)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${activeBannerIdx === i ? 'w-6 bg-red-600' : 'w-2 bg-white/30'}`}
                      />
                   ))}
                </div>
             </div>
          )}

          {/* 3. Continue Watching Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg md:text-xl font-black italic uppercase tracking-tighter flex items-center gap-2 text-white">
                <Clock className="w-5 h-5 text-blue-500" />
                Continue Watching
              </h2>
            </div>

            <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth">
              {continueWatching.length > 0 ? (
                continueWatching.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => navigateToMovie(item)}
                    className="min-w-[220px] sm:min-w-[260px] bg-[#12141a] rounded-2xl border border-zinc-800/80 overflow-hidden hover:border-blue-500/50 transition-all cursor-pointer group active:scale-95 relative"
                  >
                    <div className="relative aspect-[16/10] w-full bg-zinc-900 overflow-hidden">
                      <img 
                        src={item.cover || item.poster} 
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-center justify-center">
                         <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                         </div>
                      </div>
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-800">
                         <div className="h-full bg-blue-500 w-[70%]" />
                      </div>
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <div className="truncate pr-2">
                        <h3 className="font-bold text-xs truncate text-zinc-100">{item.title}</h3>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Resume Playback</p>
                      </div>
                      <button 
                        onClick={(e) => clearHistoryItem(e, item.subjectId || item.id)}
                        className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
                      >
                         <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="w-full py-10 bg-[#12141a] rounded-2xl border border-zinc-800 text-center flex flex-col items-center justify-center">
                   <Film className="w-8 h-8 text-zinc-600 mb-2" />
                   <span className="text-xs font-semibold text-zinc-500">No active watch history found</span>
                </div>
              )}
            </div>
          </section>

          {/* 4. My Watchlist Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg md:text-xl font-black italic uppercase tracking-tighter flex items-center gap-2 text-white">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                My Watchlist
              </h2>
            </div>

            <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth">
              {watchlist.length > 0 ? (
                watchlist.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => navigateToMovie(item)}
                    className="min-w-[130px] sm:min-w-[160px] bg-[#12141a] rounded-2xl border border-zinc-800/80 overflow-hidden hover:border-amber-400/50 transition-all cursor-pointer group active:scale-95"
                  >
                    <div className="relative aspect-[2/3] w-full bg-zinc-900 overflow-hidden">
                      <img 
                        src={item.poster || item.cover} 
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {item.score && item.score !== 'N/A' && (
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-black text-amber-400 border border-amber-400/20 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          {item.score}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-bold text-xs truncate text-zinc-100">{item.title}</h3>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{item.releaseTime || 'Featured'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="w-full py-10 bg-[#12141a] rounded-2xl border border-zinc-800 text-center flex flex-col items-center justify-center">
                   <Star className="w-8 h-8 text-zinc-600 mb-2" />
                   <span className="text-xs font-semibold text-zinc-500">Your Watchlist is empty</span>
                </div>
              )}
            </div>
          </section>

          {/* 5. Top 10 Trending Rankings */}
          {topRankings.length > 0 && (
             <section className="space-y-4">
                <h2 className="text-lg md:text-xl font-black italic uppercase tracking-tighter flex items-center gap-2 text-white">
                   <Flame className="w-5 h-5 text-red-500 fill-red-500" />
                   Top 10 Global Rankings
                </h2>
                <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth">
                   {topRankings.map((item, idx) => (
                      <div 
                        key={idx}
                        onClick={() => navigateToMovie(item)}
                        className="min-w-[150px] sm:min-w-[180px] bg-[#12141a] rounded-2xl border border-zinc-800 overflow-hidden relative group cursor-pointer active:scale-95"
                      >
                         <div className="relative aspect-[2/3] w-full bg-zinc-900">
                            <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                            <div className="absolute top-2 left-2 w-8 h-8 rounded-xl bg-red-600 text-white font-black text-sm flex items-center justify-center shadow-lg">
                               {idx + 1}
                            </div>
                         </div>
                         <div className="p-3">
                            <h3 className="font-bold text-xs truncate text-zinc-100">{item.title}</h3>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Rank #{idx + 1}</p>
                         </div>
                      </div>
                   ))}
                </div>
             </section>
          )}

          {/* 6. Dynamic Backend Catalog Rows */}
          {homeSections.map((section, sIdx) => (
            <section key={sIdx} className="space-y-4">
              <div className="flex items-center justify-between">
                 <h2 className="text-lg md:text-xl font-black italic uppercase tracking-tight text-zinc-200">
                   {section.title || 'Recommended Catalog'}
                 </h2>
                 <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                   {section.items?.length || 0} Titles
                 </span>
              </div>

              <div className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth">
                {section.items?.map((movie: any, mIdx: number) => (
                  <div 
                    key={mIdx}
                    onClick={() => navigateToMovie(movie)}
                    className="min-w-[130px] sm:min-w-[160px] bg-[#12141a] rounded-2xl border border-zinc-800/80 overflow-hidden hover:border-zinc-500 transition-all cursor-pointer group active:scale-95"
                  >
                    <div className="relative aspect-[2/3] w-full bg-zinc-900 overflow-hidden">
                      <img 
                        src={movie.poster || movie.cover} 
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {movie.score && movie.score !== 'N/A' && (
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-black text-amber-400 border border-amber-400/20 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          {movie.score}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-bold text-xs truncate text-zinc-100">{movie.title}</h3>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{movie.releaseTime || 'Featured'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

        </div>
      )}

      {/* 7. Bottom App Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-[#07090e]/95 backdrop-blur-2xl border-t border-white/5 py-3 px-6 z-50 flex items-center justify-around">
         <button onClick={() => { setActiveTab('all'); router.push('/'); }} className="flex flex-col items-center gap-1 text-red-500">
            <Film className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-wider">Home</span>
         </button>
         <button onClick={() => setActiveTab('anime')} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-200">
            <Tv className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Anime</span>
         </button>
         <button onClick={() => setActiveTab('movies')} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-200">
            <Layers className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Movies</span>
         </button>
         <button onClick={() => router.push('/profile')} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-200">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Account</span>
         </button>
      </div>

    </div>
  );
}
