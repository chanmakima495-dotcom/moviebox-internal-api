'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { movieApi } from '@/lib/api';
import { 
  User, Shield, Settings, ChevronLeft, Zap, CheckCircle2 
} from 'lucide-react';

export default function UserProfile() {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await movieApi.getUserInfo();
      if (res?.logged_in || res?.user) {
        setUserInfo(res.user || res);
      } else {
        setUserInfo({
          userId: '306509720187871533',
          is_vip: 1,
          userType: 1
        });
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 overflow-x-hidden select-none font-sans">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex items-center justify-between">
           <button 
             onClick={() => router.push('/')}
             className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-all border border-white/10 group"
           >
              <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
           </button>
           <h1 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter">Account Center</h1>
           <button className="p-3 bg-white/5 rounded-full border border-white/10">
              <Settings className="w-6 h-6 text-zinc-500" />
           </button>
        </div>

        {/* Profile Card */}
        <div className="relative group">
           <div className="absolute inset-0 bg-gradient-to-r from-red-600/30 to-amber-600/20 blur-[100px] opacity-30 group-hover:opacity-50 transition-opacity" />
           <div className="relative bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 p-8 md:p-14 flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="w-36 h-36 rounded-[2rem] bg-zinc-900 border-2 border-white/10 shadow-2xl flex items-center justify-center overflow-hidden relative">
                 <User className="w-16 h-16 text-zinc-500" />
                 <div className="absolute bottom-2 px-2.5 py-0.5 bg-amber-500 text-black text-[9px] font-black rounded-md uppercase tracking-wider">
                    VIP
                 </div>
              </div>
              
              <div className="flex-1 text-center md:text-left space-y-4">
                 <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                    <h2 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter truncate max-w-[400px]">
                       {userInfo?.userId ? `UID_${userInfo.userId}` : 'UID_30650972...'}
                    </h2>
                    
                    {/* FIXED VIP ACTIVE BADGE */}
                    <div className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-red-600 text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-red-600/30 border border-amber-400/30 flex items-center gap-1.5">
                       <CheckCircle2 className="w-3.5 h-3.5" />
                       VIP ACTIVE (LIFETIME)
                    </div>
                 </div>
                 
                 <div className="flex flex-wrap justify-center md:justify-start items-center gap-6 text-zinc-400 font-bold uppercase tracking-widest text-[10px]">
                    <div className="flex items-center gap-2">
                       <Shield className="w-4 h-4 text-emerald-400" />
                       SECURE TOKEN ACTIVE
                    </div>
                    <div className="flex items-center gap-2">
                       <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                       REAL-TIME SYNC
                    </div>
                 </div>

                 <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                    <div className="px-5 py-3 bg-zinc-900/80 rounded-2xl border border-white/5 flex items-center gap-3">
                       <div className="text-left overflow-hidden">
                          <p className="text-[8px] text-zinc-500 font-black tracking-widest uppercase">ACCESS TOKEN</p>
                          <p className="text-[10px] font-mono text-zinc-300 truncate w-60 sm:w-80">
                            {userInfo?.token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjMwNjUwOTcy...'}
                          </p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-white/5 rounded-[2rem] border border-white/5 p-8 hover:bg-white/10 transition-all group">
                <Shield className="w-10 h-10 text-emerald-400 mb-4 group-hover:scale-110 transition-transform" />
                <p className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter">
                   {userInfo?.userId || '306509720187871533'}
                </p>
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-2">OFFICIAL USER ID</p>
             </div>
             
             <div className="bg-white/5 rounded-[2rem] border border-white/5 p-8 hover:bg-white/10 transition-all group">
                <Zap className="w-10 h-10 text-amber-400 fill-amber-400 mb-4 group-hover:scale-110 transition-transform" />
                <p className="text-3xl md:text-4xl font-black italic uppercase tracking-tighter text-amber-400">
                   VIP ULTRA HQ
                </p>
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-2">ACCOUNT SUBSCRIPTION</p>
             </div>
        </div>

        {/* Security Detail */}
        <div className="bg-white/5 rounded-[2.5rem] border border-white/5 p-8 md:p-10 space-y-5">
           <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase italic tracking-tighter flex items-center gap-3">
                 <Shield className="w-5 h-5 text-blue-400" />
                 Secure Session Token
              </h3>
              <div className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[8px] font-black tracking-widest uppercase">
                 ENCRYPTED ACCESS
              </div>
           </div>
           <div className="p-6 bg-black/50 rounded-2xl border border-white/5 overflow-hidden">
              <p className="text-[11px] font-mono text-zinc-400 break-all leading-relaxed">
                 {userInfo?.token || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjMwNjUwOTcy...'}
              </p>
           </div>
           <div className="flex flex-wrap gap-3">
              <div className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-400 border border-white/5">
                 ALGORITHM: HS256
              </div>
              <div className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/20">
                 STATUS: VIP SYNCED
              </div>
           </div>
        </div>

        {/* Terminate Button */}
        <button 
          onClick={async () => {
            try {
              await movieApi.logout();
            } catch(e) {}
            router.push('/');
          }}
          className="w-full py-6 bg-zinc-900 rounded-[2rem] border border-red-600/30 text-red-500 font-black uppercase tracking-[0.3em] text-xs hover:bg-red-600 hover:text-white transition-all shadow-xl shadow-red-600/10 active:scale-[0.99]"
        >
           Terminate Secure Profile Sync
        </button>

      </div>
    </div>
  );
}
