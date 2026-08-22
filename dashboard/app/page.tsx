'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { movieApi } from '@/lib/api';
import { 
  Home, Search, Bookmark, History, User, 
  Play, Star, Trash2, Mail, Lock, Loader2, X
} from 'lucide-react';

export default function MobileAppPage() {
  const router = useRouter();

  // Navigation Tab State
  const [currentTab, setCurrentTab] = useState<'home' | 'search' | 'watchlist' | 'history' | 'account'>('home');
  const [activeCategory, setActiveCategory] = useState<'movies' | 'series' | 'anime' | 'regional'>('movies');

  // App Data States
  const [heroBanner, setHeroBanner] = useState<any>(null);
  const [topRow, setTopRow] = useState<any[]>([]);
  const [bottomRow, setBottomRow] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Auth States
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    loadInitialData();
  }, [activeCategory]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      let res: any = null;
      if (activeCategory === 'movies') res = await movieApi.getMovies(1);
      else if (activeCategory === 'anime') res = await movieApi.getAnime(1);
      else if (activeCategory === 'regional') res = await movieApi.getWestern(1);
      else res = await movieApi.getHome(1);

      const sections = Array.isArray(res?.data?.list) ? res.data.list : [];
      
      if (sections.length > 0) {
        const firstSectionItems = sections[0]?.items || [];
        setHeroBanner(firstSectionItems[0] || null);
        setTopRow(firstSectionItems.slice(1, 10));
      }

      if (sections.length > 1) {
        setBottomRow(sections[1]?.items || []);
      } else if (sections.length > 0) {
        setBottomRow((sections[0]?.items || []).slice(10, 20));
      }

      // Load History (API + LocalStorage)
      let hist: any[] = [];
      try {
        const histRes = await movieApi.getHistory(1);
        if (Array.isArray(histRes?.data?.list)) hist = histRes.data.list;
      } catch (e) {}

      if (hist.length === 0 && typeof window !== 'undefined') {
        const local = localStorage.getItem('user_history');
        if (local) {
          try { hist = JSON.parse(local); } catch (e) {}
        }
      }
      setHistoryList(hist);

      // Load Watchlist
      let wl: any[] = [];
      try {
        const wlRes = await movieApi.getWatchlist(1);
        if (Array.isArray(wlRes?.data?.list)) wl = wlRes.data.list;
      } catch (e) {}

      if (wl.length === 0 && typeof window !== 'undefined') {
        const localWl = localStorage.getItem('user_watchlist');
        if (localWl) {
          try { wl = JSON.parse(localWl); } catch (e) {}
        }
      }
      setWatchlist(wl);

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await movieApi.search(q, 1);
      setSearchResults(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (e) {}
  };

  const handleDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = historyList.filter((item) => (item.subjectId || item.id) !== id);
    setHistoryList(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_history', JSON.stringify(updated));
    }
  };

  const openMovie = (item: any) => {
    const id = item?.subjectId || item?.id;
    if (id) {
      router.push(`/detail/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white font-sans select-none pb-24 overflow-x-hidden flex flex-col items-center">
      
      {/* Container restricted to mobile frame width for clean mobile look */}
      <main className="w-full max-w-md min-h-screen flex flex-col">

        {/* ================= TAB 1: HOME ================= */}
        {currentTab === 'home' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 1. Spotlight Hero Banner */}
            {heroBanner && (
              <div className="relative w-full aspect-[4/5] overflow-hidden">
                <img 
                  src={heroBanner.poster || heroBanner.cover} 
                  alt={heroBanner.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f14] via-[#0d0f14]/40 to-transparent" />

                <div className="absolute bottom-6 left-5 right-5 space-y-3">
                  <span className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-black uppercase tracking-wider">
                    TRENDING
                  </span>
                  <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md truncate">
                    {heroBanner.title}
                  </h1>
                  <button 
                    onClick={() => openMovie(heroBanner)}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 transition-all text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30"
                  >
                    <Play className="w-4 h-4 fill-white" /> Details & Play
                  </button>
                </div>
              </div>
            )}

            {/* 2. Top Scroll Row */}
            <div className="px-4">
              <div className="flex gap-3.5 overflow-x-auto no-scrollbar py-1">
                {topRow.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => openMovie(item)}
                    className="min-w-[115px] w-[115px] space-y-1.5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22] border border-white/5 shadow-md">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400 flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400" />
                        {item.score && item.score !== 'N/A' ? item.score : '8.0'}
                      </div>
                      <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-[8px] font-bold px-1.5 py-0.5 rounded text-white uppercase">
                        Hindi
                      </span>
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                    <p className="text-[10px] text-zinc-500">{item.releaseTime || '2024'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Category Filter Tabs */}
            <div className="px-4">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: 'movies', label: 'Movies' },
                  { id: 'series', label: 'TV/Series' },
                  { id: 'anime', label: 'Anime' },
                  { id: 'regional', label: 'Asian/Regional' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveCategory(tab.id as any)}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      activeCategory === tab.id
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                        : 'bg-[#181c24] text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Bottom Grid / Scroll Row */}
            <div className="px-4 pb-6">
              <div className="grid grid-cols-3 gap-3.5">
                {bottomRow.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => openMovie(item)}
                    className="space-y-1.5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22] border border-white/5 shadow-md">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-bold text-amber-400 flex items-center gap-0.5">
                        <Star className="w-2 h-2 fill-amber-400" />
                        {item.score && item.score !== 'N/A' ? item.score : '8.5'}
                      </div>
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                    <p className="text-[10px] text-zinc-500">{item.releaseTime || '2026'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: SEARCH ================= */}
        {currentTab === 'search' && (
          <div className="px-4 py-6 space-y-6 w-full animate-fadeIn">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search"
                className="w-full bg-[#181c24] border border-white/5 rounded-2xl pl-11 pr-10 py-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-red-600 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {!searching ? (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-white">Trending Searches</h2>
                <div className="flex flex-wrap gap-2">
                  {['Spirited Away', 'The Boys', 'Taxi Driver', 'Hunter x Hunter', 'Coolie', 'Jujutsu Kaisen'].map((term, i) => (
                    <button 
                      key={i} 
                      onClick={() => handleSearch(term)}
                      className="px-4 py-2 bg-[#181c24] border border-white/5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {searchResults.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => openMovie(item)}
                    className="space-y-1.5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22] border border-white/5">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: WATCHLIST ================= */}
        {currentTab === 'watchlist' && (
          <div className="px-4 py-6 space-y-6 w-full flex-1 flex flex-col animate-fadeIn">
            <h1 className="text-xl font-black tracking-tight text-white">My Watchlist</h1>
            {watchlist.length > 0 ? (
              <div className="grid grid-cols-3 gap-3.5">
                {watchlist.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => openMovie(item)}
                    className="space-y-1.5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22] border border-white/5">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-24 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-[#181c24] border border-white/5 flex items-center justify-center text-zinc-500">
                  <Bookmark className="w-8 h-8 stroke-[1.5]" />
                </div>
                <p className="text-zinc-400 font-semibold text-sm">Your watchlist is empty</p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: HISTORY ================= */}
        {currentTab === 'history' && (
          <div className="px-4 py-6 space-y-5 w-full animate-fadeIn">
            <h1 className="text-xl font-black tracking-tight text-white">Continue Watching</h1>

            {historyList.length > 0 ? (
              <div className="space-y-3">
                {historyList.map((item, idx) => (
                  <div 
                    key={idx}
                    onClick={() => openMovie(item)}
                    className="p-3 bg-[#181c24] border border-white/5 rounded-2xl flex items-center justify-between gap-3.5 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative aspect-video w-20 rounded-xl overflow-hidden bg-[#161a22] shrink-0">
                        <img src={item.cover || item.poster} alt="" className="w-full h-full object-cover" />
                        <span className="absolute top-1 right-1 bg-emerald-600 text-[7px] font-bold px-1 rounded text-white uppercase">
                          Hindi
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold truncate text-zinc-100">{item.title}</h3>
                        <p className="text-[11px] text-amber-400/90 font-medium mt-0.5">
                          {item.seeTime ? `${Math.floor(item.seeTime / 60)} / 120 min` : '1 episodes watched • Tap to view'}
                        </p>
                        <div className="w-32 h-1 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                          <div className="h-full bg-red-600 w-[60%]" />
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={(e) => handleDeleteHistory(e, item.subjectId || item.id)}
                      className="p-2.5 text-zinc-500 hover:text-red-500 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4 stroke-[1.5]" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center text-zinc-500 font-semibold text-sm">
                No watch history found
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: ACCOUNT (SIGN IN / SIGN UP) ================= */}
        {currentTab === 'account' && (
          <div className="px-6 py-12 space-y-8 w-full flex flex-col items-center justify-center flex-1 animate-fadeIn">
            
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center mb-2">
                <Lock className="w-8 h-8 text-red-600 stroke-[2.2]" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">Welcome Back</h1>
              <p className="text-xs text-zinc-400 font-medium">Sign in to access premium media content</p>
            </div>

            <div className="w-full bg-[#181c24] border border-white/5 rounded-3xl p-5 space-y-4 shadow-xl">
              <div className="space-y-1.5">
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 w-4 h-4 text-zinc-400" />
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address"
                    className="w-full bg-[#12151c] border border-white/5 rounded-2xl pl-11 pr-4 py-3.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-red-600 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-zinc-400" />
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-[#12151c] border border-white/5 rounded-2xl pl-11 pr-4 py-3.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-red-600 transition-colors"
                  />
                </div>
              </div>

              <button className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 transition-all text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-red-600/30">
                Sign In
              </button>
            </div>

            <p className="text-xs text-zinc-400 font-medium text-center">
              Don't have an account?{' '}
              <button 
                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="text-red-600 font-bold hover:underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        )}

      </main>

      {/* ================= BOTTOM TAB NAVIGATION BAR ================= */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0d0f14]/95 backdrop-blur-2xl border-t border-white/5 py-2.5 px-6 z-50 flex items-center justify-around max-w-md mx-auto">
        {[
          { id: 'home', label: 'Home', icon: Home },
          { id: 'search', label: 'Search', icon: Search },
          { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
          { id: 'history', label: 'History', icon: History },
          { id: 'account', label: 'Account', icon: User }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as any)}
              className={`flex flex-col items-center gap-1 transition-all relative ${
                isActive ? 'text-red-600' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className={`p-1.5 rounded-2xl transition-all ${isActive ? 'bg-red-600/10' : ''}`}>
                <Icon className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-[10px] font-bold tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

    </div>
  );
}
