'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { movieApi } from '../../../lib/api';
import { 
  ArrowLeft, Settings, ChevronDown, 
  Clock, Calendar, Star, Film, Loader2
} from 'lucide-react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

function ArtPlayer({ option, getInstance, className }: any) {
  const artRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const art = new Artplayer({
      ...option,
      container: artRef.current!,
    });

    if (getInstance && typeof getInstance === 'function') {
      getInstance(art);
    }

    return () => {
      if (art && art.destroy) {
        art.destroy(false);
      }
    };
  }, [option.url]);

  return <div ref={artRef} className={className}></div>;
}

export default function MovieDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<number | string>(1);
  const [streamInfo, setStreamInfo] = useState<any>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<any>(null);
  
  const [showDubDropdown, setShowDubDropdown] = useState(false);
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
      
      let epList: any[] = [];
      let sList: any[] = [];

      if (data?.subjectType === 2 || data?.isCollection) {
         const epRes = await movieApi.getEpisodes(id as string);
         sList = epRes?.data?.seasons || epRes?.data || [];
         setSeasons(sList);
         if (sList.length > 0) {
            epList = sList[0]?.episodes || [];
            setEpisodes(epList);
         }
      }

      setLoading(false);

      // Auto-load stream for first episode / movie
      const initialEp = epList.length > 0 ? (epList[0]?.episodeNumber || 1) : 1;
      const initialSeason = sList.length > 0 ? (sList[0]?.seasonNumber || 1) : 1;
      setCurrentEpisode(initialEp);
      loadStream(initialSeason, initialEp, data?.subjectId || id);

    } catch (e) {
      setLoading(false);
    }
  };

  const loadStream = async (seasonNum: number, epNum: number | string, targetSubId?: string, resId?: string) => {
     try {
        setStreamLoading(true);
        const subId = targetSubId || selectedLanguage?.subjectId || id;
        const resourceId = resId || selectedLanguage?.id;

        const streamData = await movieApi.getStream(
          subId as string, 
          seasonNum || 1, 
          epNum as any || 1, 
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
        }
        setStreamLoading(false);
     } catch (e) {
        console.error("Stream Load Error:", e);
        setStreamLoading(false);
     }
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

  const handleLanguageSelect = (lang: any) => {
     setSelectedLanguage(lang);
     setShowDubDropdown(false);
     loadStream(
        seasons[selectedSeasonIdx]?.seasonNumber || 1, 
        currentEpisode, 
        lang ? lang.subjectId : id, 
        lang ? lang.id : undefined
     );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#07090e]">
      <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#07090e] text-white flex flex-col font-sans select-none">
      {/* 1. Header Navigation Bar */}
      <div className="w-full flex items-center justify-between px-4 py-3 bg-[#07090e] border-b border-zinc-900 sticky top-0 z-50">
        <button 
          onClick={() => router.back()} 
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors active:scale-95"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>
        <span className="font-bold text-sm tracking-wider uppercase truncate max-w-[200px] text-zinc-300">
          {movie?.title || 'Player'}
        </span>
        <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400">
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* 2. Top 16:9 Video Player Canvas */}
      <div className="w-full max-w-4xl mx-auto aspect-video bg-black relative shadow-2xl border-b border-zinc-900">
         {streamLoading && (
            <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
               <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
               <span className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Buffering Stream...</span>
            </div>
         )}

         {streamInfo?.url ? (
            <ArtPlayer
               key={streamInfo.url}
               option={{
                 url: streamInfo.url,
                 autoplay: true,
                 theme: '#10b981',
                 volume: 0.8,
                 pip: true,
                 fullscreen: true,
                 fullscreenWeb: true,
                 moreVideoAttr: {
                   crossOrigin: 'anonymous',
                   playsInline: true,
                 },
                 subtitle: {
                   url: streamInfo.subtitles && streamInfo.subtitles.length > 0 
                        ? `https://movieboxapi-xp54.onrender.com/sub-proxy?u=${encodeURIComponent(streamInfo.subtitles[0].filePath || streamInfo.subtitles[0].url)}` 
                        : '',
                   type: 'vtt',
                   style: { color: '#fff', fontSize: '18px' },
                   encoding: 'utf-8'
                 },
                 customType: {
                   m3u8: function (video: HTMLVideoElement, url: string, art: any) {
                     if (Hls.isSupported()) {
                       if (art.hls) art.hls.destroy();
                       const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                       hls.loadSource(url);
                       hls.attachMedia(video);
                       art.hls = hls;
                       art.on('destroy', () => hls.destroy());
                     } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                       video.src = url;
                     }
                   }
                 }
               }}
               getInstance={(art: any) => {
                 artInstance.current = art;
               }}
               className="w-full h-full"
            />
         ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
               <img src={movie?.cover || movie?.poster} className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm" alt="" />
               <Film className="w-12 h-12 text-zinc-600 mb-2 relative z-10" />
               <span className="text-zinc-400 text-sm font-semibold relative z-10">Select an Episode or Audio track below to begin playback</span>
            </div>
         )}
      </div>

      {/* 3. Controls & Selector Workspace */}
      <div className="w-full max-w-4xl mx-auto px-4 py-6 flex-1">
         <h4 className="text-xs font-bold text-zinc-400 tracking-wider mb-4 uppercase">
            Resource / Season
         </h4>

         {/* Dropdowns row */}
         <div className="flex flex-wrap items-center gap-3 mb-6 relative">
            {/* Audio / Dub Selector */}
            <div className="relative">
               <button 
                 onClick={() => { setShowDubDropdown(!showDubDropdown); setShowSeasonDropdown(false); }}
                 className="flex items-center gap-2 px-5 py-2.5 bg-[#181a20] hover:bg-[#20232b] rounded-xl text-xs font-bold border border-zinc-800 text-zinc-200 transition-colors"
               >
                  <span>{selectedLanguage ? selectedLanguage.name : "Original Audio"}</span>
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
               </button>

               {showDubDropdown && (
                  <div className="absolute top-12 left-0 w-52 bg-[#181a20] border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1">
                     <button
                       onClick={() => handleLanguageSelect(null)}
                       className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold ${!selectedLanguage ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                     >
                        Original Audio
                     </button>
                     {movie?.languages?.map((lang: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => handleLanguageSelect(lang)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold ${selectedLanguage?.name === lang.name ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                        >
                           {lang.name}
                        </button>
                     ))}
                  </div>
               )}
            </div>

            {/* Season Selector */}
            {seasons.length > 0 && (
               <div className="relative">
                  <button 
                    onClick={() => { setShowSeasonDropdown(!showSeasonDropdown); setShowDubDropdown(false); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#181a20] hover:bg-[#20232b] rounded-xl text-xs font-bold border border-zinc-800 text-zinc-200 transition-colors"
                  >
                     <span>Season {String(seasons[selectedSeasonIdx]?.seasonNumber || 1).padStart(2, '0')}</span>
                     <ChevronDown className="w-4 h-4 text-zinc-400" />
                  </button>

                  {showSeasonDropdown && (
                     <div className="absolute top-12 left-0 w-44 bg-[#181a20] border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1">
                        {seasons.map((s: any, idx: number) => (
                           <button
                             key={idx}
                             onClick={() => handleSeasonSelect(idx)}
                             className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold ${selectedSeasonIdx === idx ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                           >
                              Season {String(s.seasonNumber).padStart(2, '0')}
                           </button>
                        ))}
                     </div>
                  )}
               </div>
            )}
         </div>

         {/* 4. Episode Matrix Grid (01, 02, 03...) */}
         {episodes.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
               {episodes.map((ep: any, idx: number) => {
                  const epNumber = ep.episodeNumber || idx + 1;
                  const isSelected = String(currentEpisode) === String(epNumber);

                  return (
                     <button
                       key={idx}
                       onClick={() => handleEpisodeClick(epNumber)}
                       className={`aspect-[4/3] rounded-xl flex items-center justify-center font-bold text-sm transition-all active:scale-95 border ${
                          isSelected 
                            ? 'bg-[#1b433e] text-[#2ec4b6] border-[#2ec4b6]/40 shadow-lg shadow-emerald-950' 
                            : 'bg-[#22252d] text-zinc-300 border-transparent hover:bg-[#2b2f3a]'
                       }`}
                     >
                        {String(epNumber).padStart(2, '0')}
                     </button>
                  );
               })}
            </div>
         ) : (
            <div className="p-4 bg-[#181a20] border border-zinc-800/80 rounded-2xl flex items-center gap-4">
               <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 font-bold text-xs rounded-lg uppercase">
                  Single Feature
               </div>
               <span className="text-xs text-zinc-400">Full Length Movie is active on the player above.</span>
            </div>
         )}

         {/* Movie Information Footer details */}
         <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col gap-3">
            <h1 className="text-xl font-bold text-white">{movie?.title}</h1>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">{movie?.description}</p>
         </div>
      </div>
    </div>
  );
}
