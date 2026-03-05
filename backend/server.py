from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import uuid
import random
import json
import httpx
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ===== MODELS =====
class RegisterInput(BaseModel):
    email: str
    password: str
    name: str

class LoginInput(BaseModel):
    email: str
    password: str

class SessionInput(BaseModel):
    session_id: str

class RoomCreate(BaseModel):
    name: str

class TrajectoryRequest(BaseModel):
    angle: float
    velocity: float
    cannon_x: float
    cannon_y: float

GRAVITY = 9.8

# ===== AUTH HELPERS =====
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def make_session_cookie(response: Response, session_token: str):
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*3600)

# ===== AUTH ENDPOINTS =====
@api_router.post("/auth/register")
async def register(inp: RegisterInput, response: Response):
    existing = await db.users.find_one({"email": inp.email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email already registered")
    password_hash = bcrypt.hashpw(inp.password.encode(), bcrypt.gensalt()).decode()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id, "email": inp.email, "name": inp.name,
        "picture": None, "password_hash": password_hash,
        "created_at": datetime.now(timezone.utc)
    })
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    make_session_cookie(response, session_token)
    return {"user_id": user_id, "email": inp.email, "name": inp.name, "picture": None}

@api_router.post("/auth/login")
async def login(inp: LoginInput, response: Response):
    user = await db.users.find_one({"email": inp.email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Invalid credentials")
    if not bcrypt.checkpw(inp.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Invalid credentials")
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    make_session_cookie(response, session_token)
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "picture": user.get("picture")}

@api_router.post("/auth/session")
async def exchange_session(inp: SessionInput, response: Response):
    async with httpx.AsyncClient() as c:
        r = await c.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": inp.session_id}
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    data = r.json()
    user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if user:
        await db.users.update_one({"email": data["email"]}, {"$set": {"name": data["name"], "picture": data.get("picture")}})
        user_id = user["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": data["email"], "name": data["name"],
            "picture": data.get("picture"), "password_hash": None,
            "created_at": datetime.now(timezone.utc)
        })
    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    make_session_cookie(response, session_token)
    return {"user_id": user_id, "email": data["email"], "name": data["name"], "picture": data.get("picture")}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {"user_id": user["user_id"], "email": user["email"], "name": user["name"], "picture": user.get("picture")}

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ===== ROOM ENDPOINTS =====
@api_router.post("/rooms")
async def create_room(inp: RoomCreate, request: Request):
    user = await get_current_user(request)
    sides = ["usa", "ussr"]
    random.shuffle(sides)
    room_id = f"room_{uuid.uuid4().hex[:8]}"
    room = {
        "room_id": room_id, "name": inp.name,
        "host_id": user["user_id"], "host_name": user["name"],
        "guest_id": None, "guest_name": None,
        "host_side": sides[0], "guest_side": sides[1],
        "status": "waiting",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rooms.insert_one(room)
    room.pop("_id", None)
    return room

@api_router.get("/rooms")
async def list_rooms(request: Request):
    await get_current_user(request)
    # Clean old waiting rooms (>30 min)
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    await db.rooms.delete_many({"status": "waiting", "created_at": {"$lt": cutoff}})
    rooms = await db.rooms.find({"status": {"$in": ["waiting", "playing"]}}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return rooms

@api_router.post("/rooms/{room_id}/join")
async def join_room(room_id: str, request: Request):
    user = await get_current_user(request)
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(404, "Room not found")
    if room["status"] != "waiting":
        raise HTTPException(400, "Room not available")
    if room["host_id"] == user["user_id"]:
        raise HTTPException(400, "Cannot join your own room")
    await db.rooms.update_one({"room_id": room_id}, {"$set": {
        "guest_id": user["user_id"], "guest_name": user["name"],
        "status": "playing", "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    return room

@api_router.delete("/rooms/{room_id}")
async def leave_room(room_id: str, request: Request):
    user = await get_current_user(request)
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(404, "Room not found")
    if room["host_id"] == user["user_id"]:
        await db.rooms.delete_one({"room_id": room_id})
    elif room.get("guest_id") == user["user_id"]:
        await db.rooms.update_one({"room_id": room_id}, {"$set": {
            "guest_id": None, "guest_name": None, "status": "waiting"
        }})
    return {"ok": True}

# ===== PHYSICS =====
@api_router.post("/trajectory")
async def calculate_trajectory(req: TrajectoryRequest):
    angle_rad = math.radians(req.angle)
    vx = req.velocity * math.cos(angle_rad)
    vy = req.velocity * math.sin(angle_rad)
    trajectory = []
    t = 0
    dt = 0.05
    while t < 10:
        x = req.cannon_x + vx * t
        y = req.cannon_y + vy * t - 0.5 * GRAVITY * t * t
        if y <= 0:
            break
        trajectory.append({"x": round(x, 2), "y": round(y, 2), "t": round(t, 3)})
        t += dt
    return {"trajectory": trajectory}

# ===== WEBSOCKET MANAGER =====
class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
        self.game_states: Dict[str, dict] = {}

    async def connect(self, room_id, side, ws):
        await ws.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
        self.rooms[room_id][side] = ws

    def disconnect(self, room_id, side):
        if room_id in self.rooms:
            self.rooms[room_id].pop(side, None)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
                self.game_states.pop(room_id, None)

    async def send_to_room(self, room_id, message):
        if room_id in self.rooms:
            for ws in list(self.rooms[room_id].values()):
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def send_to_side(self, room_id, side, message):
        if room_id in self.rooms and side in self.rooms[room_id]:
            try:
                await self.rooms[room_id][side].send_json(message)
            except Exception:
                pass

    async def send_to_opponent(self, room_id, side, message):
        opp = "ussr" if side == "usa" else "usa"
        await self.send_to_side(room_id, opp, message)

ws_manager = ConnectionManager()

def generate_round():
    wall_x = random.randint(380, 520)
    wall_w = random.randint(20, 40)
    wall_h = random.randint(130, 270)
    ussr_x = random.randint(max(wall_x + wall_w + 150, 700), 1050)
    usa_x = random.randint(30, 120)
    return {
        "wall": {"x": wall_x, "width": wall_w, "height": wall_h},
        "usa_pos": {"x": usa_x, "y": 30},
        "ussr_pos": {"x": ussr_x, "y": 30, "width": 55 + random.randint(0, 20), "height": 55 + random.randint(0, 20)}
    }

@app.websocket("/api/ws/{room_id}")
async def websocket_endpoint(ws: WebSocket, room_id: str, token: str = ""):
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        await ws.close(code=4001, reason="User not found")
        return
    room = await db.rooms.find_one({"room_id": room_id}, {"_id": 0})
    if not room:
        await ws.close(code=4004, reason="Room not found")
        return

    if user["user_id"] == room["host_id"]:
        side = room["host_side"]
    elif user["user_id"] == room.get("guest_id"):
        side = room["guest_side"]
    else:
        await ws.close(code=4003, reason="Not a member")
        return

    await ws_manager.connect(room_id, side, ws)
    logger.info(f"Player {user['name']} connected to room {room_id} as {side}")

    try:
        # Tell this player their side and room info
        opponent_name = room["guest_name"] if user["user_id"] == room["host_id"] else room["host_name"]
        await ws.send_json({
            "type": "connected",
            "side": side,
            "opponent": opponent_name,
            "room": {"name": room["name"], "host_side": room["host_side"], "guest_side": room["guest_side"]}
        })

        # Notify opponent
        await ws_manager.send_to_opponent(room_id, side, {
            "type": "opponent_connected", "name": user["name"]
        })

        # If both connected, start game
        if len(ws_manager.rooms.get(room_id, {})) == 2:
            rd = generate_round()
            gs = {"round": 1, "scores": {"usa": 0, "ussr": 0},
                  "ready": {"usa": False, "ussr": False},
                  "actions": {"usa": None, "ussr": None}, **rd}
            ws_manager.game_states[room_id] = gs
            await ws_manager.send_to_room(room_id, {
                "type": "game_start", "game_state": gs
            })

        while True:
            data = await ws.receive_json()
            mt = data.get("type")

            if mt == "ready":
                gs = ws_manager.game_states.get(room_id)
                if not gs:
                    continue
                gs["ready"][side] = True
                gs["actions"][side] = {
                    "action": data.get("action"),
                    "angle": data.get("angle"),
                    "velocity": data.get("velocity"),
                    "timing": data.get("timing")
                }
                await ws_manager.send_to_opponent(room_id, side, {"type": "opponent_ready"})
                if gs["ready"]["usa"] and gs["ready"]["ussr"]:
                    await ws_manager.send_to_room(room_id, {
                        "type": "round_start", "actions": gs["actions"]
                    })
                    gs["ready"] = {"usa": False, "ussr": False}
                    gs["actions"] = {"usa": None, "ussr": None}

            elif mt == "round_result":
                gs = ws_manager.game_states.get(room_id)
                if not gs:
                    continue
                gs["scores"] = data.get("scores", gs["scores"])
                gs["round"] += 1
                winner = None
                if gs["scores"]["usa"] >= 5:
                    winner = "usa"
                elif gs["scores"]["ussr"] >= 5:
                    winner = "ussr"
                if winner:
                    await ws_manager.send_to_room(room_id, {
                        "type": "game_over", "winner": winner, "scores": gs["scores"]
                    })
                    await db.rooms.update_one({"room_id": room_id}, {"$set": {"status": "finished"}})
                else:
                    rd = generate_round()
                    gs.update(rd)
                    await ws_manager.send_to_room(room_id, {
                        "type": "new_round", "round": gs["round"],
                        "scores": gs["scores"], **rd
                    })

            elif mt == "chat":
                await ws_manager.send_to_room(room_id, {
                    "type": "chat", "from": user["name"],
                    "message": data.get("message", ""), "side": side
                })

            elif mt == "voice_signal":
                await ws_manager.send_to_opponent(room_id, side, {
                    "type": "voice_signal", "signal": data.get("signal")
                })

    except WebSocketDisconnect:
        logger.info(f"Player {user['name']} disconnected from room {room_id}")
        ws_manager.disconnect(room_id, side)
        await ws_manager.send_to_room(room_id, {"type": "opponent_left"})

@api_router.get("/")
async def root():
    return {"message": "Cold War Artillery API"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
