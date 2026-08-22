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

  const [currentTab, setCurrentTab] = useState<'home' | 'search' | 'watchlist' | 'history' | 'account'>('home');
  const [activeCategory, setActiveCategory] = useState<'movies' | 'series' | 'anime' | 'regional'>('movies');

  const [heroBanner, setHeroBanner] = useState<any>(null);
  const [topRow, setTopRow] = useState<any[]>([]);
  const [bottomRow, setBottomRow] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Auth States
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadInitialData();
    checkUserSession();
  }, [activeCategory]);

  const checkUserSession = async () => {
    try {
      const res = await movieApi.getUserInfo?.();
      if (res?.logged_in) setUser(res.user);
    } catch (e) {}
  };

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
        const firstItems = sections[0]?.items || [];
        setHeroBanner(firstItems[0] || null);
        setTopRow(firstItems.slice(1, 10));
      }
      if (sections.length > 1) {
        setBottomRow(sections[1]?.items || []);
      } else if (sections.length > 0) {
        setBottomRow((sections[0]?.items || []).slice(10, 20));
      }

      // Load History with LocalStorage Fallback
      let hist: any[] = [];
      try {
        const histRes = await movieApi.getHistory(1);
        if (Array.isArray(histRes?.data?.list)) hist = histRes.data.list;
      } catch (e) {}

      if (hist.length === 0 && typeof window !== 'undefined') {
        const local = localStorage.getItem('user_history');
        if (local) { try { hist = JSON.parse(local); } catch (e) {} }
      }
      setHistoryList(hist);

      // Load Watchlist with LocalStorage Fallback
      let wl: any[] = [];
      try {
        const wlRes = await movieApi.getWatchlist(1);
        if (Array.isArray(wlRes?.data?.list)) wl = wlRes.data.list;
      } catch (e) {}

      if (wl.length === 0 && typeof window !== 'undefined') {
        const localWl = localStorage.getItem('user_watchlist');
        if (localWl) { try { wl = JSON.parse(localWl); } catch (e) {} }
      }
      setWatchlist(wl);

    } catch (e) {}
    setLoading(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return alert("Please fill all fields");
    setAuthLoading(true);
    try {
      if (authMode === 'signin') {
        const res = await movieApi.login(email, password);
        setUser(res.user || { email });
        alert("Login successful!");
        setCurrentTab('home');
      } else {
        if (!otp) return alert("Please enter OTP");
        await movieApi.register(email, password, otp);
        alert("Registration successful! Please sign in.");
        setAuthMode('signin');
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Authentication failed");
    }
    setAuthLoading(false);
  };

  const requestOtp = async () => {
    if (!email) return alert("Enter email first");
    try {
      await movieApi.requestOtp(email);
      alert("OTP sent to your email!");
    } catch (e) {
      alert("Failed to send OTP");
    }
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
      // Save to local history immediately on click
      if (typeof window !== 'undefined') {
        let currentHist = [];
        try { currentHist = JSON.parse(localStorage.getItem('user_history') || '[]'); } catch(e){}
        const filtered = currentHist.filter((x: any) => (x.subjectId || x.id) !== id);
        filtered.unshift({ ...item, seeTime: Math.floor(Date.now() / 1000) });
        localStorage.setItem('user_history', JSON.stringify(filtered));
      }
      router.push(`/detail/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white font-sans select-none pb-24 overflow-x-hidden flex flex-col items-center">
      <main className="w-full max-w-md min-h-screen flex flex-col">

        {/* HOME TAB */}
        {currentTab === 'home' && (
          <div className="space-y-6 animate-fadeIn">
            {heroBanner && (
              <div className="relative w-full aspect-[4/5] overflow-hidden">
                <img src={heroBanner.poster || heroBanner.cover} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f14] via-[#0d0f14]/40 to-transparent" />
                <div className="absolute bottom-6 left-5 right-5 space-y-3">
                  <span className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-black uppercase tracking-wider">TRENDING</span>
                  <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md truncate">{heroBanner.title}</h1>
                  <button onClick={() => openMovie(heroBanner)} className="w-full py-3.5 bg-red-600 active:scale-95 transition-all text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30">
                    <Play className="w-4 h-4 fill-white" /> Details & Play
                  </button>
                </div>
              </div>
            )}

            <div className="px-4">
              <div className="flex gap-3.5 overflow-x-auto no-scrollbar py-1">
                {topRow.map((item, idx) => (
                  <div key={idx} onClick={() => openMovie(item)} className="min-w-[115px] w-[115px] space-y-1.5 cursor-pointer active:scale-95 transition-transform">
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22] border border-white/5">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400 flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400" /> {item.score && item.score !== 'N/A' ? item.score : '8.0'}
                      </div>
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: 'movies', label: 'Movies' },
                  { id: 'series', label: 'TV/Series' },
                  { id: 'anime', label: 'Anime' },
                  { id: 'regional', label: 'Asian/Regional' }
                ].map((tab) => (
                  <button key={tab.id} onClick={() => setActiveCategory(tab.id as any)} className={`px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === tab.id ? 'bg-red-600 text-white shadow-md' : 'bg-[#181c24] text-zinc-400'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 pb-6">
              <div className="grid grid-cols-3 gap-3.5">
                {bottomRow.map((item, idx) => (
                  <div key={idx} onClick={() => openMovie(item)} className="space-y-1.5 cursor-pointer active:scale-95 transition-transform">
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22] border border-white/5">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SEARCH TAB */}
        {currentTab === 'search' && (
          <div className="px-4 py-6 space-y-6 w-full animate-fadeIn">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Search" className="w-full bg-[#181c24] border border-white/5 rounded-2xl pl-11 pr-10 py-3 text-sm text-zinc-200 focus:outline-none focus:border-red-600" />
            </div>
            {!searching ? (
              <div className="space-y-4">
                <h2 className="text-base font-bold text-white">Trending Searches</h2>
                <div className="flex flex-wrap gap-2">
                  {['Spirited Away', 'The Boys', 'Taxi Driver', 'Hunter x Hunter', 'Coolie'].map((term, i) => (
                    <button key={i} onClick={() => handleSearch(term)} className="px-4 py-2 bg-[#181c24] border border-white/5 rounded-xl text-xs font-medium text-zinc-300">{term}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {searchResults.map((item, idx) => (
                  <div key={idx} onClick={() => openMovie(item)} className="space-y-1.5 cursor-pointer">
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22]">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* WATCHLIST TAB */}
        {currentTab === 'watchlist' && (
          <div className="px-4 py-6 space-y-6 w-full flex-1 flex flex-col animate-fadeIn">
            <h1 className="text-xl font-black tracking-tight text-white">My Watchlist</h1>
            {watchlist.length > 0 ? (
              <div className="grid grid-cols-3 gap-3.5">
                {watchlist.map((item, idx) => (
                  <div key={idx} onClick={() => openMovie(item)} className="space-y-1.5 cursor-pointer">
                    <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#161a22]">
                      <img src={item.poster || item.cover} alt="" className="w-full h-full object-cover" />
                    </div>
                    <h3 className="text-xs font-semibold truncate text-zinc-200">{item.title}</h3>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-24 space-y-3">
                <Bookmark className="w-12 h-12 text-zinc-600" />
                <p className="text-zinc-400 font-semibold text-sm">Your watchlist is empty</p>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {currentTab === 'history' && (
          <div className="px-4 py-6 space-y-5 w-full animate-fadeIn">
            <h1 className="text-xl font-black tracking-tight text-white">Continue Watching</h1>
            {historyList.length > 0 ? (
              <div className="space-y-3">
                {historyList.map((item, idx) => (
                  <div key={idx} onClick={() => openMovie(item)} className="p-3 bg-[#181c24] border border-white/5 rounded-2xl flex items-center justify-between gap-3.5 cursor-pointer">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative aspect-video w-20 rounded-xl overflow-hidden bg-[#161a22] shrink-0">
                        <img src={item.cover || item.poster} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold truncate text-zinc-100">{item.title}</h3>
                        <p className="text-[11px] text-amber-400 font-medium mt-0.5">Resume Playback</p>
                      </div>
                    </div>
                    <button onClick={(e) => handleDeleteHistory(e, item.subjectId || item.id)} className="p-2 text-zinc-500 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 text-center text-zinc-500 font-semibold text-sm">No watch history found</div>
            )}
          </div>
        )}

        {/* ACCOUNT TAB */}
        {currentTab === 'account' && (
          <div className="px-6 py-12 space-y-8 w-full flex flex-col items-center justify-center flex-1 animate-fadeIn">
            {user ? (
              <div className="w-full bg-[#181c24] border border-white/5 rounded-3xl p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-600/20 text-red-500 mx-auto flex items-center justify-center text-xl font-bold">
                  {user.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">{user.email || 'Logged In User'}</h2>
                  <p className="text-xs text-emerald-400 font-bold mt-1">VIP Member Active</p>
                </div>
                <button onClick={() => { setUser(null); movieApi.logout?.(); }} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-xs text-red-400">
                  Sign Out
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuth} className="w-full bg-[#181c24] border border-white/5 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="text-center pb-2">
                  <h1 className="text-xl font-black text-white">{authMode === 'signin' ? 'Welcome Back' : 'Create Account'}</h1>
                  <p className="text-xs text-zinc-400 mt-1">Sign in to sync your watchlist & history</p>
                </div>

                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" required className="w-full bg-[#12151c] border border-white/5 rounded-2xl px-4 py-3.5 text-xs text-zinc-200 focus:outline-none focus:border-red-600" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required className="w-full bg-[#12151c] border border-white/5 rounded-2xl px-4 py-3.5 text-xs text-zinc-200 focus:outline-none focus:border-red-600" />
                
                {authMode === 'signup' && (
                  <div className="flex gap-2">
                    <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP Code" className="w-full bg-[#12151c] border border-white/5 rounded-2xl px-4 py-3 text-xs text-zinc-200 focus:outline-none" />
                    <button type="button" onClick={requestOtp} className="px-4 py-3 bg-zinc-800 rounded-2xl text-[11px] font-bold text-amber-400 whitespace-nowrap">Get OTP</button>
                  </div>
                )}

                <button disabled={authLoading} className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 transition-all text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg">
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (authMode === 'signin' ? 'Sign In' : 'Register')}
                </button>

                <p className="text-xs text-zinc-400 text-center pt-2">
                  {authMode === 'signin' ? "Don't have an account? " : "Already have an account? "}
                  <button type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')} className="text-red-600 font-bold hover:underline">
                    {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </form>
            )}
          </div>
        )}

      </main>

      {/* BOTTOM NAV */}
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
            <button key={tab.id} onClick={() => setCurrentTab(tab.id as any)} className={`flex flex-col items-center gap-1 transition-all relative ${isActive ? 'text-red-600' : 'text-zinc-500 hover:text-zinc-300'}`}>
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
