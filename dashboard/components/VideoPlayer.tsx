import React, { useEffect, useRef, memo } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

declare global {
  interface Window {
    dashjs: any;
  }
}

interface VideoPlayerProps {
  url: string;
  cookie: string;
  poster?: string;
  duration?: number;
  subtitleUrl?: string | null;
  onProgress?: (progress: number) => void;
  onError?: (error: any) => void;
  startTime?: number;
}

const VideoPlayer = memo(({ 
  url, 
  cookie, 
  poster, 
  duration = 1440,
  subtitleUrl, 
  onProgress, 
  onError,
  startTime = 0 
}: VideoPlayerProps) => {
  const artRef = useRef<HTMLDivElement>(null);
  const artInstance = useRef<Artplayer | null>(null);
  const seekOffset = useRef<number>(startTime);
  const isSeekingInternal = useRef<boolean>(false);
  
  useEffect(() => {
    if (!artRef.current) return;
    if (artInstance.current) return;

    const getProxiedUrl = (u: string, cookieStr: string, start?: number) => {
      let cleanUrl = u;
      if (u.includes('proxy-media?url=')) {
        const up = new URL(u);
        cleanUrl = up.searchParams.get('url') || u;
      }
      if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1')) {
        const up = new URL(cleanUrl);
        if (start && start > 0) up.searchParams.set('start_time', start.toString());
        else up.searchParams.delete('start_time');
        return up.toString();
      }
      return cleanUrl;
    };

    const initialUrl = getProxiedUrl(url, cookie, startTime);
    seekOffset.current = startTime;
    const inferredType = initialUrl.includes('.mpd') || initialUrl.includes('.manifest') 
      ? 'mpd' 
      : (initialUrl.includes('.m3u8') ? 'm3u8' : 'mp4');

    const art = new Artplayer({
      container: artRef.current,
      url: initialUrl,
      type: inferredType,
      volume: 1.0,
      isLive: false,
      muted: false,
      autoplay: true,
      pip: true,
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      theme: '#E11D48',
      poster: poster,
      moreVideoAttr: { crossOrigin: 'anonymous' },
      subtitle: {
        url: subtitleUrl || '',
        type: 'vtt',
        style: { color: '#FF0', fontSize: '24px' },
        encoding: 'utf-8',
        escape: false
      },
      customType: {
        m3u8: function (video: HTMLMediaElement, url: string, art: any) {
          // ✅ এখন window.Hls এর বদলে import করা Hls use হচ্ছে
          if (Hls.isSupported()) {
            if (art.hls) art.hls.destroy();

            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
              backBufferLength: 30,
              maxBufferLength: 60,
              maxMaxBufferLength: 120,
              // ✅ Cookie header proxy দিয়ে যাচ্ছে, XHR header দরকার নেই
            });

            hls.on(Hls.Events.ERROR, function (_event: any, data: any) {
              if (data.fatal) {
                console.warn("HLS fatal error:", data.type, data.details);
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    // Network error — retry
                    console.warn("Network error, trying to recover...");
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.warn("Media error, trying to recover...");
                    hls.recoverMediaError();
                    break;
                  default:
                    hls.destroy();
                    if (onError) onError(data);
                    break;
                }
              }
            });

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.info("[HLS] Manifest parsed, playing...");
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            art.hls = hls;
            art.on('destroy', () => hls.destroy());

          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari native HLS
            video.src = url;
          } else {
            console.error("[HLS] Not supported in this browser");
            if (onError) onError(new Error("HLS not supported"));
          }
        },

        mpd: function (video: HTMLMediaElement, url: string, art: any) {
          const dashjs = window.dashjs;
          if (dashjs) {
            if (art.dash) {
              try { art.dash.destroy(); } catch(e) {}
            }
            const player = dashjs.MediaPlayer().create();
            player.extend("RequestModifier", function () {
              return {
                modifyRequestHeader: function (xhr: any) {
                  xhr.setRequestHeader('User-Agent', 'ExoPlayerLib/2.18.7');
                  if (cookie) {
                    xhr.setRequestHeader('Cookie', cookie);
                  }
                  return xhr;
                },
                modifyRequestURL: function (url: string) {
                  return url;
                }
              };
            }, true);
            player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
              console.warn("DashJS error:", e);
              if (onError) onError(e);
            });
            player.initialize(video, url, true);
            art.dash = player;
            art.on('destroy', () => {
              try { player.destroy(); } catch(e) {}
            });
          } else {
            video.src = url;
          }
        }
      },
    });

    artInstance.current = art;

    // === VIRTUAL TIMELINE ENGINE ===
    art.on('ready', () => {
      const isTranscoded = art.url.includes('play-compat');
      if (!isTranscoded || !duration || duration <= 0) return;

      try {
        const nativeCT = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');

        Object.defineProperty(art.video, 'currentTime', {
          get: () => {
            const realTime = nativeCT?.get?.call(art.video) ?? 0;
            return seekOffset.current + realTime;
          },
          set: (targetTime: number) => {
            if (isSeekingInternal.current) return;
            const realTimeNow = nativeCT?.get?.call(art.video) ?? 0;
            const virtualTimeNow = seekOffset.current + realTimeNow;

            if (Math.abs(targetTime - virtualTimeNow) > 4) {
              isSeekingInternal.current = true;
              console.info(`[VIRTUAL VOD] Re-tuning to ${targetTime}s...`);
              seekOffset.current = targetTime;
              const newUrl = getProxiedUrl(art.url, '', targetTime);
              art.video.src = newUrl;
              art.video.load();
              art.video.onloadedmetadata = () => {
                isSeekingInternal.current = false;
                art.play();
              };
            }
          },
          configurable: true,
        });

        Object.defineProperty(art.video, 'duration', {
          get: () => duration,
          configurable: true,
        });
        art.emit('video:durationchange');

        const syncUI = () => {
          try {
            if (!isSeekingInternal.current) {
              const realTimeNow = nativeCT?.get?.call(art.video) ?? 0;
              const virtualTimeNow = seekOffset.current + realTimeNow;
              const p = Math.min((virtualTimeNow / duration) * 100, 100);

              const curLabel = artRef.current?.querySelector('.art-time-current');
              if (curLabel) curLabel.textContent = Artplayer.utils.secondToTime(virtualTimeNow);
              const durLabel = artRef.current?.querySelector('.art-time-duration');
              if (durLabel) durLabel.textContent = Artplayer.utils.secondToTime(duration);
              const pb = artRef.current?.querySelector('.art-progress-played') as HTMLDivElement;
              if (pb) pb.style.width = `${p}%`;
              const pi = artRef.current?.querySelector('.art-progress-indicator') as HTMLDivElement;
              if (pi) pi.style.left = `${p}%`;
            }

            if (Math.abs(art.video.duration - duration) > 1) {
              Object.defineProperty(art.video, 'duration', { get: () => duration, configurable: true });
              art.emit('video:durationchange');
            }
          } catch (e) {}
        };

        art.on('video:timeupdate', syncUI);
        const t = setInterval(syncUI, 1000);
        art.on('destroy', () => clearInterval(t));
      } catch (e) {
        console.error('[VIRTUAL VOD] Setup failed:', e);
      }
    });

    art.on('video:timeupdate', () => {
      if (!isSeekingInternal.current && onProgress) {
        onProgress(art.video.currentTime);
      }
    });

    art.on('video:error', (e) => {
      console.warn("Video element error:", e);
      if (onError) onError(e);
    });

    art.on('error', (err) => {
      console.warn("Artplayer error:", err);
      if (onError) onError(err);
    });

    return () => {
      if (artInstance.current) {
        artInstance.current.destroy(false);
        artInstance.current = null;
      }
    };
  }, []);

  // Subtitle sync
  useEffect(() => {
    if (artInstance.current) {
      const art = artInstance.current;
      if (subtitleUrl) {
        art.subtitle.url = subtitleUrl;
        art.subtitle.show = true;
      } else {
        art.subtitle.show = false;
      }
    }
  }, [subtitleUrl]);

  return (
    <div 
      ref={artRef} 
      className="w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10" 
    />
  );
});

export default VideoPlayer;
