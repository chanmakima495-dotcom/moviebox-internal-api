from fastapi import FastAPI, HTTPException, Query, Response, Cookie, Request
from fastapi.responses import StreamingResponse, PlainTextResponse
import httpx
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict
from pydantic import BaseModel
import uvicorn
import os
import subprocess
import base64
import json
import asyncio
import logging
import uuid
import re
from urllib.parse import quote, unquote, urljoin
import requests
from moviebox_api import MovieBoxClient, MovieBoxAuth, MovieBoxContent, MovieBoxStream, MovieBoxUser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MovieBox Ultimate Universal Streaming Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: Dict[str, Dict] = {}
HISTORY_FILE = "local_history.json"

def load_local_history() -> dict:
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load history: {e}")
    return {"default": [], "blacklist": []}

def save_local_history(h: dict):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(h, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save history: {e}")

def get_session(session_id: Optional[str] = None):
    if session_id and session_id in sessions:
        return sessions[session_id]
        
    sid = str(uuid.uuid4())
    auth = MovieBoxAuth()
    client = MovieBoxClient(auth=auth)
    sessions[sid] = {
        "id": sid,
        "auth": auth,
        "client": client,
        "content": MovieBoxContent(client),
        "stream": MovieBoxStream(client),
        "user": MovieBoxUser(client)
    }
    
    try:
        auth.is_logged_in = False
        res = MovieBoxContent(client).get_categories(category_id=1, page=1)
        if auth.token and auth.token != "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcwNjU5NDg0MTAyMTM4MTYyMzIsInV0cCI6MSwiZXhwIjoxNzkxNzMyMjMzLCJpYXQiOjE3ODM5NTU5MzN9.7iyEzTj4vWAbOF0oXwNnZ0p3Nc1QaO6K9eMiGFyVfGs":
            auth.is_logged_in = True
    except Exception as e:
        logger.error(f"Bootstrap guest error: {e}")
        
    return sessions[sid]

class LoginRequest(BaseModel):
    account: str
    password: str
    authType: int = 1

class RegisterRequest(BaseModel):
    account: str
    password: str
    otp: str
    authType: int = 1

class OtpRequest(BaseModel):
    account: str
    authType: int = 1
    type: int = 1

@app.post("/request-otp")
def request_otp(req: OtpRequest, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["client"].request_otp(req.account, req.authType, req.type)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@app.post("/login")
def login(req: LoginRequest, response: Response, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["client"].login(req.account, req.password, req.authType)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    
    response.set_cookie(key="session_id", value=s["id"], httponly=True, samesite="lax", max_age=3600 * 24 * 30)
    return res

@app.post("/register")
def register(req: RegisterRequest, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["client"].register(req.account, req.password, req.otp, req.authType)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@app.post("/logout")
def logout(response: Response, session_id: Optional[str] = Cookie(None)):
    if session_id in sessions:
        sessions[session_id]["client"].logout()
        del sessions[session_id]
    response.delete_cookie("session_id")
    return {"status": "success"}

@app.get("/user-info")
def get_user_info(response: Response, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if not session_id:
        response.set_cookie(key="session_id", value=s["id"], httponly=True, samesite="lax")

    user_data = s["auth"].user_info or {}
    if isinstance(user_data, dict):
        user_data["is_vip"] = 1
        user_data["vip"] = 1
        user_data["user_type"] = 1
        user_data["vip_expire_date"] = "2099-12-31"

    return {"logged_in": True, "mode": "Official Account", "user": user_data, "session_id": s["id"], "is_vip": 1, "vip": 1, "user_type": 1}

def map_actor(actor: dict):
    avatar = actor.get("avatarUrl") or actor.get("avatar") or actor.get("photo") or actor.get("poster") or ""
    if isinstance(avatar, dict): avatar = avatar.get("url") or ""
    if isinstance(avatar, str) and avatar.startswith("//"): avatar = "https:" + avatar
    return {"name": actor.get("name") or actor.get("actorName") or "Unknown", "role": actor.get("character") or actor.get("role") or "Cast", "avatar": avatar}

def map_item(src: dict, depth: int = 0):
    item = src.get("subject") if ("subject" in src and isinstance(src["subject"], dict)) else src
    sid = str(item.get("subjectId") or item.get("id") or "")
    title = item.get("title") or item.get("name") or item.get("subjectName") or src.get("title") or "Unknown"
    
    poster_url = ""
    for k in ["poster", "cover", "image", "thumb", "horizontalPoster", "banner"]:
        val = item.get(k)
        if isinstance(val, dict) and val.get("url"):
            poster_url = val.get("url"); break
        elif isinstance(val, str) and (val.startswith("http") or val.startswith("//")):
            poster_url = val; break

    if isinstance(poster_url, str) and poster_url.startswith("//"):
        poster_url = "https:" + poster_url

    score = item.get("imdbRatingValue") or item.get("imdbRate") or item.get("starRating") or item.get("score") or "N/A"
    release_date = item.get("releaseDate") or item.get("releaseTime") or item.get("year") or ""
    display_year = release_date[:4] if release_date and len(release_date) >= 4 else "2024"

    runtime = item.get("duration") or item.get("runtime") or item.get("minute")
    if isinstance(runtime, int): runtime = f"{runtime}m"

    return {
        "subjectId": sid,
        "id": sid,
        "title": title,
        "cover": poster_url,
        "poster": poster_url,
        "score": str(score),
        "releaseTime": display_year,
        "subjectType": item.get("subjectType") or item.get("type") or (2 if item.get("episodeCount") or item.get("seasonCount") else 1),
        "runtime": runtime or "120m",
        "duration": runtime or "120m",
        "description": item.get("description") or "",
    }

def format_tab_sections(items: list):
    sections = []
    is_direct = True
    for row in items:
        if isinstance(row, dict) and (row.get("list") or row.get("items") or row.get("subjects") or row.get("movieList")):
            is_direct = False
            break
            
    if is_direct and items:
         mapped = [map_item(m) for m in items if m.get("subjectId") or m.get("id")]
         if mapped: return [{"title": "Featured", "items": mapped}]

    for row in items:
        if not isinstance(row, dict): continue
        title = row.get("title") or row.get("name") or "Category"
        inner = row.get("list") or row.get("items") or row.get("subjects") or row.get("movieList") or []
        real_movies = []
        for i in inner:
            if not isinstance(i, dict): continue
            if isinstance(i.get("subject"), dict): real_movies.append(i["subject"])
            elif i.get("subjectId") or i.get("id"): real_movies.append(i)
        
        if real_movies:
            sections.append({"title": title, "type": row.get("subjectType") or "SUBJECTS_MOVIE", "items": [map_item(m) for m in real_movies]})
    return sections

@app.get("/home")
def get_home(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=1, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 500, "message": str(e), "data": {"list": []}}

@app.get("/anime")
def get_anime(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=8, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": []}

@app.get("/movies")
def get_movies(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=2, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": []}

@app.get("/kids")
def get_kids(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=23, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": []}

@app.get("/western")
def get_western(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=19, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": []}

@app.get("/search")
def search(q: str, page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].search(q, page=page)
        items = (res.get("data", {})).get("list") or []
        return {"code": 0, "data": {"items": [map_item(i) for i in items]}}
    except: return {"code": 0, "data": {"items": []}}

@app.get("/rankings")
def get_rankings(tabId: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_rankings("/wefeed-mobile-bff/tab/ranking-list", tab_id=tabId)
        items = (res.get("data") or {}).get("subjects") or []
        return {"code": 0, "data": [{"title": "Top Rankings", "items": [map_item(i) for i in items[:10]]}]}
    except: return {"code": 0, "data": []}

@app.get("/detail/{subject_id}")
def get_detail(subject_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["content"].get_movie_detail(subject_id)
    data = res.get("data", {})
    if not data: return {"code": 1, "msg": "Not found"}

    mapped = map_item(data)
    mapped["cast"] = [map_actor(a) for a in (data.get("staffList") or data.get("actorList") or [])]
    
    all_languages = []
    for dub in (data.get("dubs") or []):
        all_languages.append({"id": None, "subjectId": dub.get("subjectId"), "name": dub.get("lanName") or "Custom Dub"})
        
    try:
        det_res = s["client"].request('GET', '/wefeed-mobile-bff/subject-api/get', params={'subjectId': subject_id})
        detectors = (det_res.get('data') or {}).get('resourceDetectors') or []
        for d in detectors:
            all_languages.append({"id": d.get("resourceId"), "subjectId": subject_id, "name": d.get("name") or "Resource", "type": "resource"})
    except: pass
        
    mapped["languages"] = all_languages
    return {"code": 0, "data": mapped}

@app.get("/episodes/{series_id}")
def get_episodes(series_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["content"].get_episode_list(series_id)
    data = res.get("data") or {}
    raw_seasons = data.get("seasons") or data.get("seasonList") or []
    
    mapped_seasons = []
    for s_raw in raw_seasons:
        num = s_raw.get("seasonNumber") or s_raw.get("se") or 1
        eps = []
        pool = s_raw.get("episodes") or s_raw.get("allEp") or []
        if isinstance(pool, list):
            for item in pool:
                if isinstance(item, dict):
                    en = item.get("episodeNumber") or item.get("ep") or 1
                    eps.append({"episodeNumber": str(en), "title": item.get("title") or f"Episode {en}"})
                else:
                    eps.append({"episodeNumber": str(item), "title": f"Episode {item}"})
        if eps:
            mapped_seasons.append({"seasonNumber": num, "episodes": eps})
    return {"code": 0, "data": {"seasons": mapped_seasons}}

def is_h264(stream_obj):
    url = str(stream_obj.get("url", "")).lower()
    codec = str(stream_obj.get("codec") or stream_obj.get("codecName") or "").lower()
    if any(k in codec or k in url for k in ["h265", "hevc", "x265", "hev1"]):
        return False
    return True

# --- 100% BULLETPROOF MULTI-TIER STREAM EXTRACTION ---
@app.get("/stream/{subject_id}")
def get_stream(
    subject_id: str, 
    season: Optional[int] = 1, 
    episode: Optional[int] = 1, 
    quality: Optional[str] = "720p", 
    resource_id: Optional[str] = None, 
    session_id: Optional[str] = Cookie(None)
):
    s = get_session(session_id)
    
    # 0. Check Subject Type (Strict Movie vs TV Series handling)
    is_movie = False
    subject_detail = {}
    try:
        subject_detail = s["content"].get_movie_detail(subject_id).get("data") or {}
        stype = str(subject_detail.get("subjectType") or subject_detail.get("type") or "1")
        if stype == "1":
            is_movie = True
    except: pass

    res_se = None if is_movie else (season or 1)
    res_ep = None if is_movie else (episode or 1)
    
    # TIER 1: Standard Play Info API
    res = s["stream"].get_play_info(subject_id, season=res_se, episode=res_ep, resource_id=resource_id)
    data = res.get("data", {})
    raw_streams = data.get("streamList") or data.get("streams") or []
    
    # TIER 2: Resource Detectors (Covers All Hindi, UGC & Dubs)
    if not raw_streams:
        try:
            detectors = subject_detail.get("resourceDetectors") or []
            for det in detectors:
                if resource_id and str(det.get("resourceId")) != str(resource_id): continue
                for res_item in (det.get("resolutionList") or []):
                    if not is_movie:
                        item_se = res_item.get("se") or res_item.get("season")
                        item_ep = res_item.get("ep") or res_item.get("episode")
                        if item_se and item_ep and (int(item_se) != int(season or 1) or int(item_ep) != int(episode or 1)):
                            continue
                    stream_url = res_item.get("resourceLink") or res_item.get("downloadUrl")
                    if stream_url:
                        raw_streams.append({
                            "url": stream_url,
                            "quality": f"{res_item.get('resolution')}p" if res_item.get("resolution") else "Auto",
                            "signCookie": det.get("signCookie") or res_item.get("signCookie") or "",
                            "id": res_item.get("resourceId") or det.get("resourceId") or "",
                            "codec": res_item.get("codecName") or det.get("codecName") or ""
                        })
        except: pass

    # TIER 3: Direct Video Detail POST (Carrier 301)
    if not raw_streams:
        try:
            v_res = s["client"].request('POST', '/index/video/v_detail', data={'subjectId': subject_id, 'carrier': '301', 'quality': quality})
            v_data = v_res.get("data") or {}
            raw_streams = v_data.get("streamList") or v_data.get("streams") or []
        except: pass

    # TIER 4: Emergency Non-parameterized Play Info
    if not raw_streams:
        try:
            em_res = s["stream"].get_play_info(subject_id)
            em_data = em_res.get("data", {})
            raw_streams = em_data.get("streamList") or em_data.get("streams") or []
        except: pass

    # Prioritize Browser Playable H.264 Streams
    compatible = [st for st in raw_streams if is_h264(st)]
    streams = compatible if compatible else raw_streams

    global_cookie = res.get("signCookie") or data.get("signCookie") or s["client"].session.cookies.get("signCookie") or s["auth"].token
    working_stream = streams[0] if streams else None
    
    if not working_stream:
        raise HTTPException(status_code=404, detail="Stream unavailable on all mirrors.")

    raw_stream_url = working_stream.get("url", "")
    working_cookie = working_stream.get("signCookie") or global_cookie or ""
    
    proxy_stream_url = f"/stream-proxy?u={quote(raw_stream_url)}&c={quote(working_cookie or '')}"

    return {
        "code": 0,
        "url": proxy_stream_url,
        "raw_url": raw_stream_url,
        "cookie": working_cookie,
        "duration": 3600,
        "subtitles": data.get("subTitleList", []),
        "isHls": raw_stream_url.lower().endswith(".m3u8") or ".m3u8" in raw_stream_url.lower(),
        "is_vip": 1
    }

# --- COMPLETE M3U8 & TS SEGMENT PROXY (BYPASSES ALL CDN BLOCKS) ---
@app.get("/stream-proxy")
async def stream_proxy(request: Request, u: str, c: Optional[str] = ""):
    raw_u = unquote(u)
    
    # Target specific Referers based on host
    if "sacdn2.hakunaymatata.com" in raw_u:
        referer = "https://movieboxapi-xp54.onrender.com/"
    elif "hakunaymatata.com" in raw_u:
        referer = "https://www.movieboxpro.app/"
    else:
        referer = "https://www.moviebox.ph/"

    req_hdrs = {
        "User-Agent": "ExoPlayerLib/2.19.1",
        "Referer": referer,
        "Cookie": c or ""
    }
    
    # 1. Rewrite M3U8 Playlist (Both Master & Media chunks)
    if ".m3u8" in raw_u.lower():
        try:
            async with httpx.AsyncClient(verify=False, timeout=25.0) as client:
                resp = await client.get(raw_u, headers=req_hdrs, follow_redirects=True)
                if resp.status_code == 200:
                    lines = resp.text.splitlines()
                    rewritten = []
                    for line in lines:
                        line_str = line.strip()
                        if line_str and not line_str.startswith("#"):
                            full_chunk_url = urljoin(raw_u, line_str)
                            chunk_proxy = f"/stream-proxy?u={quote(full_chunk_url)}&c={quote(c or '')}"
                            rewritten.append(chunk_proxy)
                        else:
                            rewritten.append(line_str)
                    
                    return PlainTextResponse(
                        "\n".join(rewritten),
                        media_type="application/vnd.apple.mpegurl",
                        headers={
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Headers": "*",
                            "Access-Control-Allow-Methods": "*"
                        }
                    )
        except Exception as e:
            logger.error(f"M3U8 Proxy Error: {e}")

    # 2. Byte Range Streaming for Seeking
    if "range" in request.headers:
        req_hdrs["Range"] = request.headers["range"]

    client = httpx.AsyncClient(verify=False, timeout=30.0)
    req = client.build_request("GET", raw_u, headers=req_hdrs)
    r = await client.send(req, stream=True)

    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
    }
    for h in ["content-range", "content-length", "content-type"]:
        if h in r.headers: headers[h.title()] = r.headers[h]

    return StreamingResponse(
        r.aiter_bytes(chunk_size=1024 * 512),
        status_code=r.status_code,
        headers=headers,
        background=client.aclose
    )

@app.get("/sub-proxy")
async def subtitle_proxy(u: str):
    async with httpx.AsyncClient(verify=False) as client:
        res = await client.get(u, headers={"User-Agent": "ExoPlayerLib/2.18.7"}, follow_redirects=True)
        return Response(content=res.content, media_type="text/vtt", headers={"Access-Control-Allow-Origin": "*"})

@app.get("/history")
def get_history(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    h = load_local_history()
    user_history = h.get("default", [])
    if not s["auth"].is_guest_mode:
        try:
            res = s["user"].get_history(page=page)
            data = res.get("data", {})
            cloud_list = data.get("items") or data.get("list") or []
            for c in cloud_list:
                mapped = map_item(c)
                mapped["seeTime"] = c.get("seeTime") or 0
                user_history.append(mapped)
        except: pass
    return {"code": 0, "data": {"list": user_history}}

@app.get("/watchlist")
def get_watchlist(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode: return {"code": 0, "data": {"list": []}}
    try:
        res = s["user"].get_watchlist(page=page)
        cloud_list = (res.get("data", {})).get("items") or []
        return {"code": 0, "data": {"list": [map_item(x) for x in cloud_list]}}
    except: return {"code": 0, "data": {"list": []}}

@app.post("/watchlist/toggle")
def toggle_watchlist(subject_id: str, active: bool, subject_type: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode: return {"status": "guest_ignored"}
    action = 1 if active else 2
    return {"status": "success", "raw": s["user"].toggle_watchlist(subject_id, action=action, subject_type=subject_type)}

if __name__ == "__main__":
    uvicorn.run("moviebox_api_server:app", host="0.0.0.0", port=8000, reload=False)
