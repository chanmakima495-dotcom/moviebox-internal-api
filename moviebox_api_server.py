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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MovieBox Ultimate Full Master Backend")

# Enable CORS for Next.js frontend & production
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Multi-session management dictionary
sessions: Dict[str, Dict] = {}

HISTORY_FILE = "local_history.json"

def load_local_history() -> dict:
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load local history: {e}")
    return {"default": [], "blacklist": []}

def save_local_history(h: dict):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(h, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save local history: {e}")

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
    logger.info(f"Created new master session: {sid}")
    
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

def map_room(src: dict):
    return {
        "id": str(src.get("groupId") or src.get("id")),
        "name": src.get("name") or "Community Room",
        "title": src.get("name") or "Community Room",
        "avatar": src.get("cover", {}).get("url") if isinstance(src.get("cover"), dict) else src.get("avatar") or "",
        "description": src.get("description") or "",
        "members": src.get("userCount") or 0,
        "posts": src.get("postCount") or 0,
        "tags": src.get("tags") or []
    }

def map_item(src: dict, depth: int = 0):
    item = src.get("subject") if ("subject" in src and isinstance(src["subject"], dict)) else src
    sid = str(item.get("subjectId") or item.get("id") or "")
    title = (
        item.get("title") or item.get("name") or item.get("subjectName") or 
        item.get("subject_name") or item.get("categoryName") or item.get("content") or 
        item.get("keyword") or item.get("keywordName") or item.get("itemName") or 
        src.get("title") or src.get("name") or "Unknown"
    )
    
    poster_url = ""
    for k in ["poster", "cover", "image", "thumb", "horizontalPoster", "banner", "pic", "picture"]:
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
        if isinstance(row, dict) and (row.get("list") or row.get("items") or row.get("subjects") or row.get("movieList") or row.get("customData") or row.get("banner")):
            is_direct = False
            break
            
    if is_direct and items:
         mapped = [map_item(m) for m in items if m.get("subjectId") or m.get("id")]
         if mapped: return [{"title": "Featured", "items": mapped}]

    for row in items:
        if not isinstance(row, dict): continue
        title = row.get("title") or row.get("name") or "Category Section"
        
        inner = []
        for k in ["list", "items", "subjects", "movieList"]:
            if isinstance(row.get(k), list):
                inner = row.get(k)
                break
                
        real_movies = []
        for i in inner:
            if not isinstance(i, dict): continue
            if isinstance(i.get("subject"), dict): real_movies.append(i["subject"])
            elif i.get("subjectId") or i.get("id"): real_movies.append(i)
        
        if real_movies:
            sections.append({
                "title": title,
                "type": row.get("subjectType") or "SUBJECTS_MOVIE",
                "items": [map_item(m) for m in real_movies]
            })
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

@app.get("/short-tv")
def get_short_tv(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=13, page=page)
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

@app.get("/education")
def get_education(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=3, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": []}

@app.get("/music")
def get_music(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=4, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": []}

@app.get("/asian")
def get_asian(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=18, page=page)
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

@app.get("/nollywood")
def get_nollywood(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=28, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": {"list": []}}

@app.get("/game")
def get_game(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=11, page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except: return {"code": 1, "data": {"list": []}}

@app.get("/discovery")
def get_discovery(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_discovery()
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": [map_item(i) for i in items[:20]]}
    except: return {"code": 1, "data": []}

@app.get("/trending")
def get_trending(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_trending()
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": [map_item(i) for i in items[:20]]}
    except: return {"code": 1, "data": []}

@app.get("/search-suggestions")
def get_search_suggestions(response: Response, q: Optional[str] = None, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    response.set_cookie(key="session_id", value=s["id"], httponly=True, samesite="lax")
    try:
        if q:
            res = s["content"].search(q, page=1)
            items = (res.get("data", {})).get("list") or []
        else:
            res = s["content"].get_search_suggestions()
            items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": [i.get("keyword") or i.get("title") or str(i) for i in items if i]}
    except: return {"code": 0, "data": []}

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

@app.get("/rooms/recommend")
def get_rooms(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_rooms(page=page)
        items = (res.get("data") or {}).get("list") or []
        return {"code": 0, "data": [map_room(r) for r in items]}
    except: return {"code": 1, "data": []}

@app.get("/rooms/{room_id}")
def get_room_detail(room_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_room_detail(room_id)
        return {"code": 0, "data": map_room(res.get("data") or {})}
    except: return {"code": 1, "data": {}}

@app.get("/sports/live")
def get_sports_live(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_live_channels()
        items = (res.get("data") or {}).get("list") or []
        channels = [map_item(c) for c in items]
        channels.append({
            "id": "external_sports_aggregator",
            "title": "Live Sports Aggregator",
            "name": "Live Sports Today",
            "type": "external_web",
            "url": "https://sportslivetoday.com/live/detail?id=3552262265162844888&sportType=cricket",
            "cover": "https://img.icons8.com/color/48/000000/cricket.png",
            "tag": "LIVE"
        })
        return {"code": 0, "data": channels}
    except: return {"code": 1, "data": []}

@app.get("/detail/{subject_id}")
def get_detail(subject_id: str, depth: int = 0, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["content"].get_movie_detail(subject_id)
    data = res.get("data", {})
    
    is_collection = False
    items = []
    if not data or not (data.get("title") or data.get("name")):
        try:
           cat_res = s["content"].get_categories(category_id=subject_id, page=1)
           items = (cat_res.get("data") or {}).get("list") or []
           if items:
               is_collection = True
               data = {"subjectId": subject_id, "title": f"Collection {subject_id}", "isCollection": True, "items": items}
        except: pass

    if not data: return {"code": 1, "msg": "Not found"}

    mapped = map_item(data, depth=depth)
    mapped["cast"] = [map_actor(a) for a in (data.get("staffList") or data.get("actorList") or [])]
    
    all_languages = []
    for dub in (data.get("dubs") or []):
        all_languages.append({"id": None, "subjectId": dub.get("subjectId"), "name": dub.get("lanName") or "Custom Dub", "type": "dub"})
        
    try:
        det_res = s["client"].request('GET', '/wefeed-mobile-bff/subject-api/get', params={'subjectId': subject_id})
        for d in (det_res.get('data') or {}).get('resourceDetectors') or []:
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
        pool = s_raw.get("episodes") or s_raw.get("allEp") or s_raw.get("episodeList") or []
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

# --- ULTIMATE 100% PLAYABLE MULTI-TIER STREAM RESOLVER ---
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
    
    is_movie = False
    subject_detail = {}
    try:
        subject_detail = s["content"].get_movie_detail(subject_id).get("data") or {}
        if str(subject_detail.get("subjectType") or subject_detail.get("type") or "1") == "1":
            is_movie = True
    except: pass

    res_se = None if is_movie else (season or 1)
    res_ep = None if is_movie else (episode or 1)
    
    res = s["stream"].get_play_info(subject_id, season=res_se, episode=res_ep, resource_id=resource_id)
    data = res.get("data", {})
    raw_streams = data.get("streamList") or data.get("streams") or []
    
    if not raw_streams:
        try:
            for det in (subject_detail.get("resourceDetectors") or []):
                if resource_id and str(det.get("resourceId")) != str(resource_id): continue
                for res_item in (det.get("resolutionList") or []):
                    stream_url = res_item.get("resourceLink") or res_item.get("downloadUrl")
                    if stream_url:
                        raw_streams.append({
                            "url": stream_url,
                            "quality": f"{res_item.get('resolution')}p" if res_item.get("resolution") else "Auto",
                            "signCookie": det.get("signCookie") or res_item.get("signCookie") or "",
                            "id": res_item.get("resourceId") or det.get("resourceId") or ""
                        })
        except: pass

    if not raw_streams:
        try:
            v_res = s["client"].request('POST', '/index/video/v_detail', data={'subjectId': subject_id, 'carrier': '301', 'quality': quality})
            raw_streams = (v_res.get("data") or {}).get("streamList") or []
        except: pass

    if not raw_streams:
        try:
            em_res = s["stream"].get_play_info(subject_id)
            raw_streams = (em_res.get("data") or {}).get("streamList") or []
        except: pass

    compatible = [st for st in raw_streams if is_h264(st)]
    streams = compatible if compatible else raw_streams

    global_cookie = res.get("signCookie") or data.get("signCookie") or s["client"].session.cookies.get("signCookie") or s["auth"].token
    working_stream = streams[0] if streams else None
    
    if not working_stream:
        raise HTTPException(status_code=404, detail="Stream unavailable.")

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

# --- UNIVERSAL M3U8 MASTER/CHUNK REWRITE PROXY ---
@app.get("/stream-proxy")
async def stream_proxy(request: Request, u: str, c: Optional[str] = ""):
    raw_u = unquote(u)
    
    if "sacdn2.hakunaymatata.com" in raw_u: referer = "https://movieboxapi-xp54.onrender.com/"
    elif "hakunaymatata.com" in raw_u: referer = "https://www.movieboxpro.app/"
    else: referer = "https://www.moviebox.ph/"

    req_hdrs = {"User-Agent": "ExoPlayerLib/2.19.1", "Referer": referer, "Cookie": c or ""}
    
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
                        headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}
                    )
        except Exception as e:
            logger.error(f"M3U8 proxy error: {e}")

    if "range" in request.headers: req_hdrs["Range"] = request.headers["range"]

    client = httpx.AsyncClient(verify=False, timeout=30.0)
    req = client.build_request("GET", raw_u, headers=req_hdrs)
    r = await client.send(req, stream=True)

    headers = {"Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*"}
    for h in ["content-range", "content-length", "content-type"]:
        if h in r.headers: headers[h.title()] = r.headers[h]

    return StreamingResponse(r.aiter_bytes(chunk_size=1024 * 512), status_code=r.status_code, headers=headers, background=client.aclose)

@app.get("/sub-proxy")
async def subtitle_proxy(u: str):
    async with httpx.AsyncClient(verify=False) as client:
        res = await client.get(u, headers={"User-Agent": "ExoPlayerLib/2.18.7"}, follow_redirects=True)
        return Response(content=res.content, media_type="text/vtt", headers={"Access-Control-Allow-Origin": "*"})

@app.get("/history")
def get_history(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    h = load_local_history()
    return {"code": 0, "data": {"list": h.get("default", [])}}

@app.get("/watchlist")
def get_watchlist(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode: return {"code": 0, "data": {"list": []}}
    try:
        res = s["user"].get_watchlist(page=page)
        return {"code": 0, "data": {"list": [map_item(x) for x in (res.get("data", {})).get("items") or []]}}
    except: return {"code": 0, "data": {"list": []}}

@app.post("/watchlist/toggle")
def toggle_watchlist(subject_id: str, active: bool, subject_type: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode: return {"status": "guest_ignored"}
    return {"status": "success", "raw": s["user"].toggle_watchlist(subject_id, action=1 if active else 2, subject_type=subject_type)}

if __name__ == "__main__":
    uvicorn.run("moviebox_api_server:app", host="0.0.0.0", port=8000, reload=False)
