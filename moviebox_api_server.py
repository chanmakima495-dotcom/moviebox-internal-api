from fastapi import FastAPI, HTTPException, Query, Response, Cookie, Request
from fastapi.responses import StreamingResponse
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
from urllib.parse import quote
from moviebox_api import MovieBoxClient, MovieBoxAuth, MovieBoxContent, MovieBoxStream, MovieBoxUser

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MovieBox Unofficial API Backend")

# Enable CORS for All (Localhost + Vercel Production)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Multi-session management
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
    logger.info(f"Created new session: {sid}")
    
    try:
        auth.is_logged_in = False
        res = MovieBoxContent(client).get_categories(category_id=1, page=1)
        if auth.token and auth.token != "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcwNjU5NDg0MTAyMTM4MTYyMzIsInV0cCI6MSwiZXhwIjoxNzkxNzMyMjMzLCJpYXQiOjE3ODM5NTU5MzN9.7iyEzTj4vWAbOF0oXwNnZ0p3Nc1QaO6K9eMiGFyVfGs":
            auth.is_logged_in = True
    except Exception as e:
        logger.error(f"Failed to bootstrap guest session: {e}")
        
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
    
    response.set_cookie(
        key="session_id", 
        value=s["id"], 
        httponly=True, 
        samesite="lax",
        max_age=3600 * 24 * 30
    )
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

# --- VIP OVERRIDE USER INFO ---
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

    return {
        "logged_in": True,
        "mode": "Official Account", 
        "user": user_data,
        "session_id": s["id"],
        "is_vip": 1,
        "vip": 1,
        "user_type": 1
    }

def map_actor(actor: dict):
    avatar = actor.get("avatarUrl") or actor.get("avatar") or actor.get("photo") or actor.get("poster") or ""
    if isinstance(avatar, dict): avatar = avatar.get("url") or ""
    if isinstance(avatar, str) and avatar.startswith("//"): avatar = "https:" + avatar
    return {
        "name": actor.get("name") or actor.get("actorName") or "Unknown",
        "role": actor.get("character") or actor.get("role") or "Cast",
        "avatar": avatar
    }

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
    if "subject" in src and isinstance(src["subject"], dict):
        item = src["subject"]
    else:
        item = src

    sid = str(item.get("subjectId") or item.get("id") or "")
    title = (
        item.get("title") or 
        item.get("name") or 
        item.get("subjectName") or 
        item.get("subject_name") or
        item.get("categoryName") or
        item.get("content") or 
        item.get("keyword") or
        item.get("keywordName") or
        item.get("itemName") or
        item.get("show_name") or
        item.get("showTitle") or
        item.get("titleName") or
        item.get("title_en") or
        item.get("tag") or
        item.get("label") or
        item.get("extra") or
        item.get("subtitle") or
        item.get("tabName") or
        item.get("tab_name") or
        item.get("searchName") or
        item.get("promotionName") or
        src.get("title") or
        src.get("name") or
        src.get("content") or
        src.get("keyword") or
        src.get("label") or
        "Unknown"
    )
    
    dlink = str(item.get("deepLink") or src.get("deepLink") or "")
    action_type = "movie"
    category_id = None
    
    if dlink:
        if "/home/category" in dlink:
            action_type = "category"
            if "categoryType=" in dlink:
                category_id = dlink.split("categoryType=")[1].split("&")[0]
        elif "/playlist/detail" in dlink:
            action_type = "playlist"
        elif "/movie/detail" in dlink:
            action_type = "movie"

    if title == "Unknown":
        if action_type == "category" and category_id:
             title = f"Category {category_id}"
    
    poster = item.get("poster")
    poster_url = ""
    if isinstance(poster, dict): poster_url = poster.get("url")
    elif isinstance(poster, str): poster_url = poster
    
    if not poster_url:
        cover = item.get("cover")
        poster_url = cover.get("url") if isinstance(cover, dict) else cover

    if not poster_url:
        img_terms = ["image", "img", "thumb", "thumbnail", "poster", "cover", "icon", "banner", "pic", "picture"]
        for term in img_terms:
            val = item.get(term)
            if isinstance(val, dict) and val.get("url"):
                poster_url = val.get("url")
                break
            elif isinstance(val, str) and (val.startswith("http") or val.startswith("//")):
                poster_url = val
                break
        
        if not poster_url:
            for k, v in item.items():
                if any(t in k.lower() for t in img_terms) and isinstance(v, str) and (v.startswith("http") or v.startswith("//")):
                    poster_url = v
                    break

    if not poster_url:
        hp = item.get("horizontalPoster") or item.get("horizontalCover")
        poster_url = hp.get("url") if isinstance(hp, dict) else hp

    if not poster_url:
        banner = item.get("banner")
        if isinstance(banner, dict):
            poster_url = banner.get("image", {}).get("url") or banner.get("url")

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
        "subjectType": item.get("subjectType") or item.get("type") or item.get("subject_type") or (2 if item.get("episodeCount") or item.get("seasonCount") else 1),
        "runtime": runtime or "120m",
        "duration": runtime or "120m",
        "season": item.get("season"),
        "episode": item.get("episode") or item.get("ep"),
        "seeTime": item.get("seeTime"),
        "seenStatus": item.get("seenStatus"),
        "likeStatus": 1 if (
            item.get("isFavorite") == 1 or 
            item.get("is_favorite") == 1 or
            item.get("fav") == 1 or
            item.get("is_fav") == 1 or
            item.get("isLike") == 1 or 
            item.get("is_like") == 1 or
            item.get("wantToSee") == 1 or
            item.get("likeStatus") == 1 or
            item.get("collected") == 1 or
            item.get("isCollect") == 1 or
            item.get("collectedStatus") == 1 or
            str(item.get("likeType")) == "1" or
            item.get("isCollect") is True or
            item.get("isFavorite") is True
        ) else 0,
        "description": item.get("description") or "",
        "actionType": action_type,
        "categoryId": category_id,
        "deepLink": dlink
    }

def format_tab_sections(items: list):
    sections = []
    is_direct_movies = True
    for row in items:
        if isinstance(row, dict) and (row.get("list") or row.get("items") or row.get("subjects") or row.get("movieList") or row.get("customData") or row.get("banner")):
            is_direct_movies = False
            break
            
    if is_direct_movies and items:
         mapped = [map_item(m) for m in items if m.get("subjectId") or m.get("id")]
         if mapped: return [{"title": "Content", "items": mapped}]

    for row in items:
        if not isinstance(row, dict): continue
        title = row.get("title") or row.get("name") or "Section"
        
        inner = []
        if isinstance(row.get("list"), list) and row.get("list"): inner = row.get("list")
        elif isinstance(row.get("items"), list) and row.get("items"): inner = row.get("items")
        elif isinstance(row.get("subjects"), list) and row.get("subjects"): inner = row.get("subjects")
        elif isinstance(row.get("movieList"), list) and row.get("movieList"): inner = row.get("movieList")
        elif isinstance(row.get("customData"), dict) and isinstance(row["customData"].get("items"), list) and row["customData"]["items"]:
            inner = row["customData"]["items"]
        elif isinstance(row.get("banner"), dict) and isinstance(row["banner"].get("banners"), list) and row["banner"]["banners"]:
            inner = row["banner"]["banners"]
            
        real_movies = []
        for i in inner:
            if not isinstance(i, dict): continue
            if isinstance(i.get("subject"), dict):
                 real_movies.append(i["subject"])
            elif i.get("subjectId") or i.get("id"):
                 real_movies.append(i)
        
        if real_movies:
            mapped = [map_item(m) for m in real_movies]
            sections.append({
                "title": title,
                "type": row.get("subjectType") or row.get("type") or "SUBJECTS_MOVIE",
                "items": mapped
            })
    return sections

@app.get("/home")
def get_home(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=1, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        logger.error(f"Home error: {e}")
        return {"code": 500, "message": str(e), "data": {"list": []}}

@app.get("/anime")
def get_anime(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=8, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/rankings")
def get_rankings(response: Response, tabId: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    response.set_cookie(key="session_id", value=s["id"], httponly=True, samesite="lax")
    variants = ["/wefeed-mobile-bff/tab/ranking-list", "/tab/ranking-list", "/subject-api/ranking-list"]
    
    for v in variants:
        try:
            res = s["content"].get_rankings(v, tab_id=tabId)
            data = res.get("data")
            if not data: continue
            
            formatted = []
            if "subjects" in data and isinstance(data["subjects"], list):
                items = data["subjects"]
                if items:
                    formatted.append({"title": "Top Rankings", "items": [map_item(i) for i in items[:10]]})
            else:
                lists = data.get("lists") or data.get("list") 
                if isinstance(lists, list):
                    for l in lists:
                        if not isinstance(l, dict): continue
                        title = l.get("name") or l.get("title") or "Rankings"
                        items = l.get("items") or l.get("list") or []
                        if items:
                            formatted.append({"title": title, "items": [map_item(i) for i in items[:10]]})
            
            if formatted: return {"code": 0, "data": formatted}
        except Exception as e:
            continue
        
    return {"code": 0, "data": []}

@app.get("/discovery")
def get_discovery(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_discovery()
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or []
        return {"code": 0, "data": [map_item(i) for i in items[:20]]}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/trending")
def get_trending(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_trending()
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or []
        return {"code": 0, "data": [map_item(i) for i in items[:20]]}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/movies")
def get_movies(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=2, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/short-tv")
def get_short_tv(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=13, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/kids")
def get_kids(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=23, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/education")
def get_education(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=3, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/music")
def get_music(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=4, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/asian")
def get_asian(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=18, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/western")
def get_western(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=19, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/nollywood")
def get_nollywood(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=28, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "message": str(e), "data": {"list": []}}

@app.get("/game")
def get_game(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_categories(category_id=11, page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or data.get("subjects") or []
        return {"code": 0, "data": {"list": format_tab_sections(items)}}
    except Exception as e:
        return {"code": 1, "message": str(e), "data": {"list": []}}

@app.get("/search-suggestions")
def get_search_suggestions(response: Response, q: Optional[str] = None, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    response.set_cookie(key="session_id", value=s["id"], httponly=True, samesite="lax")
    try:
        if q:
            res = s["content"].search(q, page=1)
            data = res.get("data", {})
            items = data.get("list") or data.get("items") or data.get("movie") or data.get("subjects") or []
        else:
            res = s["content"].get_search_suggestions()
            data = res.get("data") if isinstance(res, dict) else {}
            if not isinstance(data, dict):
                return {"code": 0, "data": []}
            items = data.get("list") or data.get("items") or data.get("movie") or data.get("subjects") or []
            
        suggestions = []
        for i in items:
            if isinstance(i, str):
                suggestions.append(i)
            elif isinstance(i, dict):
                suggestions.append(i.get("keyword") or i.get("title") or i.get("name"))
        
        return {"code": 0, "data": [s for s in suggestions if s]}
    except Exception as e:
        return {"code": 0, "data": []}

@app.get("/search")
def search(q: str, page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].search(q, page=page)
        data = res.get("data", {})
        items = data.get("list") or data.get("items") or res.get("list") or res.get("items") or []
        return {"code": 0, "data": {"items": [map_item(i) for i in items]}}
    except Exception as e:
        return {"code": 0, "data": {"items": []}}

@app.get("/rooms/recommend")
def get_rooms(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_rooms(page=page)
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or []
        return {"code": 0, "data": [map_room(r) for r in items]}
    except Exception as e:
        return {"code": 1, "data": []}

@app.get("/rooms/{room_id}")
def get_room_detail(room_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_room_detail(room_id)
        data = res.get("data") or {}
        return {"code": 0, "data": map_room(data)}
    except Exception as e:
        return {"code": 1, "data": {}}

@app.get("/sports/live")
def get_sports_live(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["content"].get_live_channels()
        data = res.get("data") or {}
        items = data.get("list") or data.get("items") or []
        channels = [map_item(c) for c in items]
        channels.append({
            "id": "external_sports_aggregator",
            "title": "Live Sports Aggregator (Cricket/Football)",
            "name": "Live Sports Today",
            "type": "external_web",
            "url": "https://sportslivetoday.com/live/detail?id=3552262265162844888&sportType=cricket",
            "cover": "https://img.icons8.com/color/48/000000/cricket.png",
            "tag": "LIVE"
        })
        return {"code": 0, "data": channels}
    except Exception as e:
        return {"code": 1, "data": []}

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
           cat_data = cat_res.get("data", {})
           items = cat_data.get("list") or cat_data.get("items") or cat_data.get("subjects") or []
           if items:
               is_collection = True
               data = {
                   "subjectId": subject_id,
                   "title": f"Collection {subject_id}",
                   "isCollection": True,
                   "items": items
               }
        except: pass

    if not data: return {"code": 1, "msg": "Not found"}
    
    is_fav = False
    if not s["auth"].is_guest_mode:
        try:
            wl_res = s["user"].get_watchlist(page=1, per_page=50)
            wl_items = wl_res.get("data", {}).get("items") or wl_res.get("data", {}).get("list") or []
            for item in wl_items:
                if str(item.get("subject_id") or item.get("id") or item.get("subjectId")) == str(subject_id):
                    is_fav = True
                    break
        except: pass

    if is_fav:
        data["isFavorite"] = 1

    status_fields = ["isFavorite", "is_favorite", "fav", "is_fav", "collected", "isLike", "wantToSee", "likeStatus"]
    for f in status_fields:
        if f in res and f not in data:
            data[f] = res[f]

    try:
        post_res = s["client"].request("GET", "/wefeed-mobile-bff/post/count/subject", params={"subjectId": subject_id})
        data["postCount"] = post_res.get("data", {}).get("count") or "0"
    except:
        data["postCount"] = "0"

    mapped = map_item(data, depth=depth)
    mapped["postCount"] = data.get("postCount", "0")
    mapped["isCollection"] = is_collection
    
    if is_collection and depth == 0:
        mapped["collectionItems"] = [map_item(i, depth=depth+1) for i in items[:24]]
        if items and not mapped.get("poster"):
            first = map_item(items[0], depth=depth+1)
            mapped["poster"] = first.get("poster")
            mapped["cover"] = first.get("cover")

    raw_cast = data.get("staffList") or data.get("actorList") or []
    mapped["cast"] = [map_actor(a) for a in raw_cast]
    
    all_languages = []
    raw_dubs = data.get("dubs") or []
    for dub in raw_dubs:
        all_languages.append({
            "id": None, 
            "subjectId": dub.get("subjectId"), 
            "name": dub.get("lanName") or "Custom Dub",
            "type": "dub"
        })
        
    try:
        det_res = s["client"].request('GET', '/wefeed-mobile-bff/subject-api/get', params={'subjectId': subject_id})
        detectors = (det_res.get('data') or {}).get('resourceDetectors') or []
        for d in detectors:
            d_name = d.get("name") or "Resource"
            all_languages.append({
                "id": d.get("resourceId"),
                "subjectId": subject_id, 
                "name": d_name,
                "type": "resource"
            })
    except:
        pass
        
    mapped["languages"] = all_languages
    return {"code": 0, "data": mapped}

@app.get("/episodes/{series_id}")
def get_episodes(series_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    res = s["content"].get_episode_list(series_id)
    data = res.get("data") or {}
    raw_seasons = data.get("seasons") or res.get("seasons") or []
    if not raw_seasons:
        raw_seasons = data.get("seasonList") or data.get("list") or []
        
    mapped_seasons = []
    for s_raw in raw_seasons:
        num = s_raw.get("se") or s_raw.get("seasonNumber") or 1
        eps = []
        
        for key in ["allEp", "epList", "episodeList", "episodes", "list", "items"]:
            pool = s_raw.get(key)
            if not pool: continue
            
            if isinstance(pool, str):
                for e_num in pool.split(","):
                    if e_num: eps.append({"episodeNumber": e_num, "title": f"Episode {e_num}", "id": f"{series_id}_{num}_{e_num}"})
            elif isinstance(pool, list):
                for item in pool:
                    if isinstance(item, dict):
                        en = item.get("ep") or item.get("episodeNumber") or item.get("episode_number")
                        if en: eps.append({"episodeNumber": str(en), "title": item.get("title") or f"Episode {en}", "id": f"{series_id}_{num}_{en}"})
                    else:
                        eps.append({"episodeNumber": str(item), "title": f"Episode {item}", "id": f"{series_id}_{num}_{item}"})
            
            if eps: break

        if not eps:
            max_ep = s_raw.get("maxEp") or s_raw.get("max_ep") or 0
            if isinstance(max_ep, str) and max_ep.isdigit(): max_ep = int(max_ep)
            if max_ep and isinstance(max_ep, int):
                for i in range(1, max_ep + 1):
                    eps.append({"episodeNumber": str(i), "title": f"Episode {i}", "id": f"{series_id}_{num}_{i}"})

        if eps:
            mapped_seasons.append({"seasonNumber": num, "episodes": eps})
    return {"code": 0, "data": {"seasons": mapped_seasons}}

# --- HIGH FIDELITY STREAM EXTRACTION WITH PROXY ROUTE ---
@app.get("/stream/{subject_id}")
def get_stream(subject_id: str, season: int = 1, episode: int = 1, quality: Optional[str] = "720p", resource_id: Optional[str] = None, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        subject_detail = s["content"].get_movie_detail(subject_id).get("data") or {}
        is_movie = (str(subject_detail.get("subjectType") or subject_detail.get("type")) == "1")
    except: is_movie = False

    res_se = None if is_movie else season
    res_ep = None if is_movie else episode
    
    res = s["stream"].get_play_info(subject_id, season=res_se, episode=res_ep, resource_id=resource_id)
    data = res.get("data", {})
    streams = data.get("streamList") or data.get("streams") or []
    
    if not streams:
        try:
            detectors = subject_detail.get("resourceDetectors") or []
            for det in detectors:
                if resource_id and str(det.get("resourceId")) != str(resource_id): continue
                for res_item in det.get("resolutionList") or []:
                    stream_url = res_item.get("resourceLink") or res_item.get("downloadUrl")
                    if stream_url:
                        streams.append({
                            "url": stream_url,
                            "quality": f"{res_item.get('resolution')}p" if res_item.get("resolution") else "Auto",
                            "signCookie": det.get("signCookie") or res_item.get("signCookie") or "",
                            "id": res_item.get("resourceId") or det.get("resourceId") or ""
                        })
        except: pass

    global_cookie = res.get("signCookie") or data.get("signCookie") or s["client"].session.cookies.get("signCookie") or s["auth"].token
    
    working_stream = streams[0] if streams else None
    if not working_stream:
        raise HTTPException(status_code=404, detail="No streams found.")

    raw_stream_url = working_stream.get("url", "")
    working_cookie = working_stream.get("signCookie") or global_cookie or ""
    proxy_stream_url = f"/stream-proxy?u={quote(raw_stream_url)}&c={quote(working_cookie or '')}"

    all_subtitles = data.get("subTitleList", [])
    best_sub = next((s.get("url") for s in all_subtitles if s.get("lan") == "en" or "english" in (s.get("lanName") or "").lower()), None)

    return {
        "code": 0,
        "url": proxy_stream_url,
        "raw_url": raw_stream_url,
        "cookie": working_cookie,
        "duration": 3600,
        "subtitles": all_subtitles,
        "subtitle_url": best_sub,
        "isHls": raw_stream_url.lower().endswith(".m3u8") or ".m3u8" in raw_stream_url.lower(), 
        "streamId": working_stream.get("id"),
        "qualityList": list(set([st.get("quality") for st in streams if st.get("quality")])),
        "episode": episode,
        "season": season,
        "is_vip": 1
    }

# High-Speed Video Stream Proxy (Bypasses Browser CORS/403)
@app.get("/stream-proxy")
async def stream_proxy(request: Request, u: str, c: Optional[str] = ""):
    req_hdrs = {
        "User-Agent": "ExoPlayerLib/2.18.7",
        "Cookie": c or ""
    }
    if "range" in request.headers:
        req_hdrs["Range"] = request.headers["range"]

    client = httpx.AsyncClient(verify=False)
    req = client.build_request("GET", u, headers=req_hdrs)
    r = await client.send(req, stream=True)

    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
    }
    if "content-range" in r.headers:
        headers["Content-Range"] = r.headers["content-range"]
    if "content-length" in r.headers:
        headers["Content-Length"] = r.headers["content-length"]
    if "content-type" in r.headers:
        headers["Content-Type"] = r.headers["content-type"]

    return StreamingResponse(
        r.aiter_bytes(chunk_size=1024 * 512),
        status_code=r.status_code,
        headers=headers,
        background=client.aclose
    )

@app.get("/download/{subject_id}")
async def proxy_download(
    request: Request,
    subject_id: str, 
    season: int = 1, 
    episode: int = 1, 
    quality: str = "720p", 
    title: str = "Movie",
    session_id: Optional[str] = Cookie(None)
):
    s = get_session(session_id)
    c_res = s["client"].request('POST', '/index/video/v_detail', data={'subjectId': subject_id, 'carrier': '301', 'quality': quality})
    data = c_res.get("data")
    if not isinstance(data, dict): data = {}
    streams = data.get("streamList") or data.get("streams") or []
    
    if not streams:
        res = s["stream"].get_play_info(subject_id, season=season, episode=episode)
        data = res.get("data", {})
        streams = data.get("streamList") or data.get("streams") or []
    
    if not streams: 
        raise HTTPException(status_code=404, detail="No downloadable mirrors found")
    
    match = None
    for st in streams:
        if ".mp4" in st.get("url", "").lower():
            match = st
            break
    if not match: match = streams[0]
            
    url = match.get("url")
    cookie = data.get("signCookie") or match.get("signCookie") or ""
    if not url: raise HTTPException(status_code=404)
    
    clean_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
    
    if ".mp4" in url.lower():
        req_hdrs = {"User-Agent": "ExoPlayerLib/2.18.7", "Cookie": cookie}
        range_header = request.headers.get("Range")
        if range_header: req_hdrs["Range"] = range_header
            
        client = httpx.AsyncClient(verify=False)
        req = client.build_request("GET", url, headers=req_hdrs)
        r = await client.send(req, stream=True)
        
        filename = f"{clean_title}_S{season}_E{episode}.mp4"
        headers = {
            "Content-Disposition": f"attachment; filename=\"{filename}\"",
            "Accept-Ranges": r.headers.get("Accept-Ranges", "bytes"),
            "Content-Length": r.headers.get("Content-Length", ""),
            "Content-Range": r.headers.get("Content-Range", ""),
            "Content-Type": "video/mp4"
        }
        
        async def stream_generator():
            async for chunk in r.aiter_bytes(chunk_size=1024 * 1024): yield chunk

        return StreamingResponse(
            stream_generator(),
            status_code=r.status_code,
            headers={k: v for k, v in headers.items() if v},
            background=httpx.AsyncClient().aclose
        )
        
    filename = f"{clean_title}_S{season}_E{episode}.ts"
    def iter_ffmpeg():
        cmd = [
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-headers', f'Cookie: {cookie}\r\nUser-Agent: ExoPlayerLib/2.18.7\r\n',
            '-i', url,
            '-c', 'copy', '-f', 'mpegts', '-'
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            while True:
                chunk = process.stdout.read(2048 * 1024)
                if not chunk: break
                yield chunk
        finally:
            process.terminate()

    return StreamingResponse(
        iter_ffmpeg(), 
        media_type="video/mp2t",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        }
    )

@app.get("/subtitles/{subject_id}")
def get_subtitles(subject_id: str, se: int = 1, ep: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        hdrs = {"User-Agent": "Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014)", "X-M-Version": "11.7.0"}
        resource_id = subject_id
        try:
            det_res = s["client"].request('GET', '/wefeed-mobile-bff/subject-api/get', params={'subjectId': subject_id}, headers=hdrs)
            detectors = det_res.get('data', {}).get('resourceDetectors', [])
            if detectors:
                resource_id = detectors[0].get('resourceId') or subject_id
        except: pass

        res = s["client"].request('GET', '/wefeed-mobile-bff/subject-api/get-ext-captions', 
                                    params={'resourceId': resource_id, 'subjectId': subject_id, 'episode': ep}, 
                                    headers=hdrs)
        data = res.get("data", {})
        if not isinstance(data, dict): data = {}
        ls = data.get("extCaptions") or data.get("list") or []
        return {"code": 0, "data": {"list": ls}}
    except:
        return {"code": 0, "data": {"list": []}}

@app.get("/history/position")
def get_history_position(subject_id: str, resource_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    return s["client"].request('GET', '/wefeed-mobile-bff/subject-api/resource-position', params={'subjectId': subject_id, 'resourceId': resource_id})

@app.post("/history/position")
def save_history_position(subject_id: str, resource_id: str, position: int, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    return s["client"].request('POST', '/wefeed-mobile-bff/subject-api/resource-position', data={'subjectId': subject_id, 'resourceId': resource_id, 'position': position})

@app.post("/history/seen")
def mark_have_seen(subject_id: str = None, progress: int = 0, total: int = 0, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if not subject_id: return {"code": -1, "msg": "Missing ID"}
    return s["user"].report_history(subject_id, progress, total)

@app.post("/analytics/operation")
def track_operation(action: str, target: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    return s["client"].request('POST', '/wefeed-mobile-bff/statistics/user-operation', data={'action': action, 'target': target})

@app.get("/subtitles/search")
def subtitle_search(query: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        hdrs = {"User-Agent": "Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014)", "X-M-Version": "11.7.0"}
        res = s["client"].request('GET', '/wefeed-mobile-bff/subject-api/subtitle-search', params={'q': query}, headers=hdrs)
        data = res.get("data", {})
        if not isinstance(data, dict): data = {}
        ls = data.get("items") or data.get("list") or []
        return {"code": 0, "data": {"list": ls}}
    except: return {"code": 0, "data": {"list": []}}

@app.get("/history")
def get_history(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    h = load_local_history()
    default_history = h.get("default", [])
    user_specific = h.get(session_id, []) if session_id else []
    blacklist = set(h.get("blacklist", []))
    
    combined_history_dict = {str(x.get("subjectId") or x.get("id")): x for x in default_history + user_specific}
    user_history = list(combined_history_dict.values())
    
    if not s["auth"].is_guest_mode:
        try:
            res = s["user"].get_history(page=page)
            data = res.get("data", {})
            if not isinstance(data, dict): data = {}
            cloud_list = data.get("items") or data.get("list") or []
            
            seen_ids = set(combined_history_dict.keys())
            for c in cloud_list:
                sid_str = str(c.get("subjectId"))
                if sid_str not in seen_ids and sid_str not in blacklist:
                    mapped = map_item(c)
                    mapped["seeTime"] = c.get("seeTime") or c.get("updateTime") or c.get("progress") or 0
                    mapped["subjectId"] = c.get("subjectId")
                    mapped["id"] = c.get("subjectId")
                    user_history.append(mapped)
        except: pass
        
    user_history = [x for x in user_history if x.get("subjectId") and str(x.get("subjectId")) != "None" and str(x.get("subjectId")) not in blacklist]
    user_history.sort(key=lambda x: int(x.get("seeTime", 0) or 0), reverse=True)
    return {"code": 0, "data": {"list": user_history}}

@app.get("/watchlist")
def get_watchlist(page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode:
        return {"code": 0, "data": {"list": []}}
    try:
        res = s["user"].get_watchlist(page=page)
        data = res.get("data", {})
        if not isinstance(data, dict): data = {}
        cloud_list = data.get("items") or data.get("list") or []
        return {"code": 0, "data": {"list": [map_item(x) for x in cloud_list]}}
    except:
        return {"code": 0, "data": {"list": []}}

@app.post("/history/delete/{subject_id}")
def delete_history_item(subject_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode:
        raise HTTPException(status_code=401, detail="Please Sign In to manage your history.")
    res = s["user"].report_history(subject_id, 0, 0, status=0) 
    return {"status": "success", "raw": res}

@app.post("/watchlist/toggle")
def toggle_watchlist(subject_id: str, active: bool, subject_type: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode:
        raise HTTPException(status_code=401, detail="Please Sign In to manage your watchlist.")
    action = 1 if active else 2
    res = s["user"].toggle_watchlist(subject_id, action=action, subject_type=subject_type)
    return {"status": "success", "raw": res}

class ProgressReport(BaseModel):
    subject_id: str
    progress_ms: int
    total_ms: int
    status: int = 1

@app.post("/history/progress")
def report_progress(req: ProgressReport, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    if s["auth"].is_guest_mode:
        return {"status": "success"}
    return s["user"].report_history(req.subject_id, req.progress_ms, req.total_ms, req.status)

@app.get("/post/count/{subject_id}")
def get_post_count(subject_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["client"].request("GET", "/wefeed-mobile-bff/post/count/subject", params={"subjectId": subject_id})
        count = res.get("data", {}).get("count") or "0"
        return {"code": 0, "count": count}
    except:
        return {"code": 0, "count": "0"}

@app.get("/groups/trending")
def get_trending_groups(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        res = s["client"].request("POST", "/wefeed-mobile-bff/group/list/trending-entrance", data={})
        data = res.get("data", {})
        items = data.get("items") or []
        return {"code": 0, "data": items}
    except:
        return {"code": 0, "data": []}

@app.post("/post/like")
def like_post(post_id: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        return s["client"].request("POST", "/wefeed-mobile-bff/interactive/post/like", data={"postId": post_id})
    except Exception as e:
        return {"code": 1, "msg": str(e)}

@app.post("/post/create")
def create_post(subject_id: str, content: str, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        data = {"subjectId": subject_id, "content": content, "type": "1"}
        return s["client"].request("POST", "/wefeed-mobile-bff/post/create", data=data)
    except Exception as e:
        return {"code": 1, "msg": str(e)}

@app.get("/groups/interactive")
def get_interactive_posts(session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        return s["client"].request("POST", "/wefeed-mobile-bff/interactive/post/list", data={"page": 1, "pageSize": 20})
    except Exception as e:
        return {"code": 1, "msg": str(e)}

@app.get("/post/list/{subject_id}")
def get_subject_posts(subject_id: str, page: int = 1, session_id: Optional[str] = Cookie(None)):
    s = get_session(session_id)
    try:
        return s["client"].request("POST", "/wefeed-mobile-bff/post/list/subject", data={"subjectId": subject_id, "page": page, "pageSize": 10})
    except Exception as e:
        return {"code": 1, "msg": str(e)}

@app.get("/sub-proxy")
async def subtitle_proxy(u: str):
    async with httpx.AsyncClient(verify=False) as client:
        res = await client.get(u, headers={"User-Agent": "ExoPlayerLib/2.18.7"}, follow_redirects=True)
        return Response(content=res.content, media_type="text/vtt", headers={"Access-Control-Allow-Origin": "*"})

if __name__ == "__main__":
    uvicorn.run("moviebox_api_server:app", host="0.0.0.0", port=8000, reload=False)
