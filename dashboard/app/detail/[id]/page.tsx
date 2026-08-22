'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { movieApi } from '../../../lib/api';
import { 
  Play, Plus, Star, ChevronLeft, 
  Clock, Calendar, Languages, Film, X, 
  Settings, ChevronDown, Loader2
} from 'lucide-react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

function ArtPlayer({ option, getInstance, className }: any) {
  const artRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!artRef.current || !option?.url) return;

    const isHls = option.url.includes('.m3u8') || option.isHls;

    const art = new Artplayer({
      ...option,
      container: artRef.current,
      type: isHls ? 'm3u8' : 'mp4',
      customType: {
        m3u8: function (video: HTMLVideoElement, url: string, artInstance: any) {
          if (Hls.isSupported()) {
            if (artInstance.hls) artInstance.hls.destroy();
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              xhrSetup: function (xhr: any) {
                xhr.withCredentials = false;
              }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            artInstance.hls = hls;
            artInstance.on('destroy', () => hls.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          }
        }
      }
    });

    if (getInstance && typeof getInstance === 'function') {
      getInstance(art);
    }

    return () => {
      if (art && art.destroy) {
        art.destroy(false);
      }
    };
  }, [option?.url]);

  return <div ref={artRef} className={className}></div>;
}

export default function MovieDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [watchlistActive, setWatchlistActive] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<number | string>(1);
  const [streamInfo, setStreamInfo] = useState<any>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<any>(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  
  const artInstance = useRef<any>(null);

  useEffect(() => {
    if (id) {
       fetchDetail();
    }
  }, [id]);

  const fetchDetail = async () => {
    try {
      const res = await movieApi.getDetail(id as string);
      const data = res?.data || res;
      setMovie(data);
      
      if (data?.subjectType === 2 || data?.isCollection) {
         const epRes = await movieApi.getEpisodes(id as string);
         const list = epRes?.data?.seasons || epRes?.data || [];
         setSeasons(list);
         if (list.length > 0) {
            setEpisodes(list[0]?.episodes || []);
         }
      }
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  };

  const loadStream = async (seasonNum?: number, epNum?: number | string, targetSubId?: string, resId?: string) => {
     try {
        setStreamLoading(true);
        const subId = targetSubId || selectedLanguage?.subjectId || id;
        const resourceId = resId || selectedLanguage?.id;

        const isTv = movie?.subjectType === 2;
        const finalSeason = isTv ? (seasonNum || 1) : 1;
        const finalEpisode = isTv ? (epNum || 1) : 1;

        const streamData = await movieApi.getStream(
          subId as string, 
          finalSeason, 
          finalEpisode as any, 
          '720p', 
          resourceId || undefined
        );
        
        const stream = streamData?.data || streamData;
        if (stream?.url) {
           let playUrl = stream.url;
           if (!playUrl.startsWith('http://') && !playUrl.startsWith('https://')) {
              playUrl = `https://movieboxapi-xp54.onrender.com${playUrl.startsWith('/') ? '' : '/'}${playUrl}`;
           }
           stream.url = playUrl;
           setStreamInfo(stream);
        } else {
           setStreamInfo(null);
        }
        setStreamLoading(false);
     } catch (e) {
        console.error("Stream Load Error:", e);
        setStreamInfo(null);
        setStreamLoading(false);
     }
  };

  const handleWatchNow = () => {
    setIsPlaying(true);
    const initialEp = episodes.length > 0 ? (episodes[0]?.episodeNumber || 1) : 1;
    const initialSeason = seasons.length > 0 ? (seasons[0]?.seasonNumber || 1) : 1;
    setCurrentEpisode(initialEp);
    loadStream(initialSeason, initialEp);
  };

  const handleEpisodeClick = (epNum: number | string) => {
     setCurrentEpisode(epNum);
     loadStream(seasons[selectedSeasonIdx]?.seasonNumber || 1, epNum);
  };

  const handleSeasonSelect = (idx: number) => {
     setSelectedSeasonIdx(idx);
     setShowSeasonDropdown(false);
     const newEpisodes = seasons[idx]?.episodes || [];
     setEpisodes(newEpisodes);
     if (newEpisodes.length > 0) {
        const ep = newEpisodes[0]?.episodeNumber || 1;
        setCurrentEpisode(ep);
        loadStream(seasons[idx]?.seasonNumber || 1, ep);
     }
  };

  const handleWatchlist = async () => {
    if (!movie) return;
    try {
      await movieApi.toggleWatchlist(id as string, !watchlistActive, movie.subjectType || 1);
      setWatchlistActive(!watchlistActive);
    } catch (e) {}
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!movie) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
       <h1 className="text-2xl font-bold mb-4">Movie Not Found</h1>
       <button onClick={() => router.back()} className="px-6 py-2 bg-zinc-800 rounded-full">Go Back</button>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#07090e] text-white overflow-x-hidden pb-20 font-sans select-none">
      
      {isPlaying ? (
        <div className="flex flex-col min-h-screen">
          <div className="w-full flex items-center justify-between px-4 py-3 bg-[#07090e] border-b border-zinc-900 sticky top-0 z-50">
            <button 
              onClick={() => setIsPlaying(false)} 
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <span className="font-bold text-sm tracking-wider uppercase truncate max-w-[200px] text-zinc-300">
              {movie?.title}
            </span>
            <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400">
              <Settings className="w-6 h-6" />
            </button>
          </div>

          <div className="w-full max-w-4xl mx-auto aspect-video bg-black relative shadow-2xl border-b border-zinc-900">
             {streamLoading && (
                <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                   <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                   <span className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Connecting Stream...</span>
                </div>
             )}

             {streamInfo?.url ? (
                <ArtPlayer
                   key={streamInfo.url}
                   option={{
                     url: streamInfo.url,
                     autoplay: true,
                     theme: '#f59e0b',
                     volume: 0.8,
                     pip: true,
                     fullscreen: true,
                     fullscreenWeb: true,
                     isHls: streamInfo.isHls,
                     moreVideoAttr: { 
                       crossOrigin: 'anonymous', 
                       playsInline: true 
                     },
                     subtitle: {
                       url: streamInfo.subtitles && streamInfo.subtitles.length > 0 
                            ? `https://movieboxapi-xp54.onrender.com/sub-proxy?u=${encodeURIComponent(streamInfo.subtitles[0].filePath || streamInfo.subtitles[0].url)}` 
                            : '',
                       type: 'vtt',
                       style: { color: '#fff', fontSize: '18px' },
                       encoding: 'utf-8'
                     }
                   }}
                   getInstance={(art: any) => { artInstance.current = art; }}
                   className="w-full h-full"
                />
             ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-3 p-6 text-center">
                   <Film className="w-10 h-10 text-zinc-600" />
                   <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Stream buffering or selecting mirror</span>
                   <button 
                     onClick={() => loadStream(seasons[selectedSeasonIdx]?.seasonNumber || 1, currentEpisode)}
                     className="px-4 py-2 bg-amber-400 text-black font-bold rounded-xl text-xs transition-colors"
                   >
                     Retry Mirror
                   </button>
                </div>
             )}
          </div>

          <div className="w-full max-w-4xl mx-auto px-4 py-6 flex-1">
             <h4 className="text-xs font-bold text-zinc-400 tracking-wider mb-4 uppercase">Resource / Season</h4>
             <div className="flex flex-wrap items-center gap-3 mb-6 relative">
                <button 
                  onClick={() => setShowLanguageModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#181a20] hover:bg-[#20232b] rounded-xl text-xs font-bold border border-zinc-800 text-zinc-200"
                >
                   <span>{selectedLanguage ? selectedLanguage.name : "Original Audio / Dub"}</span>
                   <ChevronDown className="w-4 h-4 text-zinc-400" />
                </button>

                {seasons.length > 0 && (
                   <button 
                     onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
                     className="flex items-center gap-2 px-5 py-2.5 bg-[#181a20] hover:bg-[#20232b] rounded-xl text-xs font-bold border border-zinc-800 text-zinc-200"
                   >
                      <span>Season {String(seasons[selectedSeasonIdx]?.seasonNumber || 1).padStart(2, '0')}</span>
                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                   </button>
                )}

                {showSeasonDropdown && (
                   <div className="absolute top-12 left-32 w-44 bg-[#181a20] border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1">
                      {seasons.map((s: any, idx: number) => (
                         <button
                           key={idx}
                           onClick={() => handleSeasonSelect(idx)}
                           className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold ${selectedSeasonIdx === idx ? 'bg-amber-400/10 text-amber-400 font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                         >
                            Season {String(s.seasonNumber).padStart(2, '0')}
                         </button>
                      ))}
                   </div>
                )}
             </div>

             {episodes.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                   {episodes.map((ep: any, idx: number) => {
                      const epNumber = ep.episodeNumber || idx + 1;
                      const isSelected = String(currentEpisode) === String(epNumber);
                      return (
                         <button
                           key={idx}
                           onClick={() => handleEpisodeClick(epNumber)}
                           className={`aspect-[4/3] rounded-xl flex items-center justify-center font-bold text-sm transition-all border ${
                              isSelected ? 'bg-amber-400/20 text-amber-400 border-amber-400/50 shadow-lg' : 'bg-[#22252d] text-zinc-300 border-transparent hover:bg-[#2b2f3a]'
                           }`}
                         >
                            {String(epNumber).padStart(2, '0')}
                         </button>
                      );
                   })}
                </div>
             ) : (
                <div className="p-4 bg-[#181a20] border border-zinc-800 rounded-2xl flex items-center gap-4">
                   <div className="px-3 py-1 bg-amber-400/20 text-amber-400 font-bold text-xs rounded-lg uppercase">Single Feature</div>
                   <span className="text-xs text-zinc-400">Full Length Movie active on player above.</span>
                </div>
             )}

             <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col gap-2">
                <h1 className="text-xl font-bold text-white">{movie?.title}</h1>
                <p className="text-xs text-zinc-400 leading-relaxed">{movie?.description}</p>
             </div>
          </div>
        </div>
      ) : (
        <>
          <div className="absolute top-0 left-0 w-full h-[70vh] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-black/40 to-transparent z-10" />
            <img src={movie.cover || movie.poster} className="w-full h-full object-cover opacity-50 scale-105 blur-[2px]" alt="" />
          </div>

          <div className="relative z-20 pt-10 px-6 md:px-16 container mx-auto">
            <button 
              onClick={() => router.back()}
              className="group mb-12 flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 backdrop-blur-md transition-all font-bold text-xs"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Catalog
            </button>

            <div className="flex flex-col lg:flex-row gap-12 items-start mb-20">
              <div className="w-full max-w-[320px] shrink-0 mx-auto lg:mx-0 shadow-2xl rounded-3xl overflow-hidden border border-white/10 relative">
                 <img src={movie.poster || movie.cover} className="w-full h-full object-cover" alt="" />
                 {movie.score && movie.score !== 'N/A' && (
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-yellow-500 text-black px-3 py-1 rounded-lg font-black italic tracking-tighter">
                       <Star className="w-4 h-4 fill-black" />
                       {movie.score}
                    </div>
                 )}
              </div>

              <div className="flex-1 max-w-3xl">
                 <div className="flex flex-wrap items-center gap-3 mb-6">
                    <span className="px-3 py-1 bg-amber-400 text-black rounded-md text-[10px] font-black uppercase tracking-[0.2em] italic">
                       {movie.subjectType === 2 ? 'TV Series' : 'Movie'}
                    </span>
                 </div>

                 <h1 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter mb-6 text-white drop-shadow-2xl">
                    {movie.title}
                 </h1>

                 <p className="text-lg md:text-xl text-zinc-400 leading-relaxed max-w-2xl font-medium mb-10">
                    {movie.description}
                 </p>

                 <div className="flex flex-wrap gap-4 mb-12">
                    <button 
                      onClick={handleWatchNow}
                      className="flex items-center gap-3 px-10 py-5 bg-amber-400 text-black hover:bg-white rounded-2xl font-black italic uppercase tracking-widest shadow-xl shadow-amber-400/20 transition-all hover:scale-105 active:scale-95"
                    >
                       <Play className="w-6 h-6 fill-black text-black" />
                       Watch Now
                    </button>
                    
                    <button 
                      onClick={handleWatchlist}
                      className={`flex items-center gap-3 px-10 py-5 rounded-2xl font-black italic uppercase tracking-widest border-2 ${watchlistActive ? 'bg-zinc-800 border-zinc-800' : 'bg-transparent border-white/20 hover:bg-white/5'}`}
                    >
                       <Plus className={`w-6 h-6 ${watchlistActive ? 'rotate-45' : ''} transition-transform`} />
                       {watchlistActive ? 'Wishlisted' : 'Wishlist'}
                    </button>
                 </div>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                       { icon: Clock, label: 'Duration', value: movie.duration || movie.runtime || '120m' },
                       { icon: Calendar, label: 'Released', value: movie.releaseTime || '2024' },
                       { icon: Languages, label: 'Language', value: movie.language || 'Multi' },
                       { icon: Film, label: 'Source', value: 'VIP Premium' }
                    ].map((item, i) => (
                       <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <item.icon className="w-5 h-5 text-amber-400 mb-2" />
                          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">{item.label}</div>
                          <div className="text-sm font-bold truncate">{item.value}</div>
                       </div>
                    ))}
                 </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showLanguageModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
           <div className="w-full max-w-md bg-zinc-900 rounded-3xl border border-white/10 overflow-hidden shadow-2xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                 <h3 className="text-lg font-bold flex items-center gap-2"><Languages size={20} className="text-amber-400" /> Select Audio / Dub</h3>
                 <button onClick={() => setShowLanguageModal(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={20} /></button>
              </div>
              <div className="py-4 flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
                 <button 
                   onClick={() => { setSelectedLanguage(null); setShowLanguageModal(false); loadStream(seasons[selectedSeasonIdx]?.seasonNumber || 1, currentEpisode); }}
                   className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold"
                 >
                    Original Audio
                 </button>
                 {movie.languages?.map((lang: any, idx: number) => (
                    <button 
                      key={idx}
                      onClick={() => { setSelectedLanguage(lang); setShowLanguageModal(false); loadStream(seasons[selectedSeasonIdx]?.seasonNumber || 1, currentEpisode, lang.subjectId, lang.id); }}
                      className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold"
                    >
                       {lang.name}
                    </button>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
