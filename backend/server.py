from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import math


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class GameStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    hits: int = 0
    attempts: int = 0
    difficulty: str = "medium"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GameStatsCreate(BaseModel):
    hits: int
    attempts: int
    difficulty: str

class TrajectoryRequest(BaseModel):
    angle: float  # degrees
    velocity: float  # m/s
    cannon_x: float
    cannon_y: float

class TrajectoryPoint(BaseModel):
    x: float
    y: float
    t: float

class CollisionCheck(BaseModel):
    angle: float
    velocity: float
    cannon_pos: dict
    wall_pos: dict
    target_pos: dict
    
class CollisionResult(BaseModel):
    hit_target: bool
    hit_wall: bool
    trajectory: List[dict]


# Physics constants
GRAVITY = 9.8  # m/s²

@api_router.get("/")
async def root():
    return {"message": "Physics Cannon Game API"}

@api_router.post("/trajectory")
async def calculate_trajectory(req: TrajectoryRequest):
    """Calculate projectile trajectory using physics"""
    angle_rad = math.radians(req.angle)
    vx = req.velocity * math.cos(angle_rad)
    vy = req.velocity * math.sin(angle_rad)
    
    trajectory = []
    t = 0
    dt = 0.05  # time step
    max_time = 10  # maximum simulation time
    
    while t < max_time:
        x = req.cannon_x + vx * t
        y = req.cannon_y + vy * t - 0.5 * GRAVITY * t * t
        
        # Stop if projectile hits ground
        if y <= 0:
            break
            
        trajectory.append({
            "x": round(x, 2),
            "y": round(y, 2),
            "t": round(t, 3)
        })
        t += dt
    
    return {"trajectory": trajectory}

@api_router.post("/check-collision", response_model=CollisionResult)
async def check_collision(req: CollisionCheck):
    """Check if projectile hits wall or target"""
    angle_rad = math.radians(req.angle)
    vx = req.velocity * math.cos(angle_rad)
    vy = req.velocity * math.sin(angle_rad)
    
    cannon_x = req.cannon_pos["x"]
    cannon_y = req.cannon_pos["y"]
    
    wall_x = req.wall_pos["x"]
    wall_y = req.wall_pos["y"]
    wall_width = req.wall_pos["width"]
    wall_height = req.wall_pos["height"]
    
    target_x = req.target_pos["x"]
    target_y = req.target_pos["y"]
    target_width = req.target_pos["width"]
    target_height = req.target_pos["height"]
    
    trajectory = []
    hit_wall = False
    hit_target = False
    
    t = 0
    dt = 0.02
    max_time = 10
    
    while t < max_time and not hit_wall and not hit_target:
        x = cannon_x + vx * t
        y = cannon_y + vy * t - 0.5 * GRAVITY * t * t
        
        if y <= 0:
            break
        
        trajectory.append({"x": round(x, 2), "y": round(y, 2)})
        
        # Check wall collision
        if (wall_x <= x <= wall_x + wall_width and 
            0 <= y <= wall_height):
            hit_wall = True
            break
        
        # Check target collision
        if (target_x <= x <= target_x + target_width and 
            target_y <= y <= target_y + target_height):
            hit_target = True
            break
        
        t += dt
    
    return CollisionResult(
        hit_target=hit_target,
        hit_wall=hit_wall,
        trajectory=trajectory
    )

@api_router.post("/stats", response_model=GameStats)
async def save_game_stats(input: GameStatsCreate):
    """Save game statistics"""
    stats_dict = input.model_dump()
    stats_obj = GameStats(**stats_dict)
    
    doc = stats_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    await db.game_stats.insert_one(doc)
    return stats_obj

@api_router.get("/stats", response_model=List[GameStats])
async def get_game_stats():
    """Get all game statistics"""
    stats = await db.game_stats.find({}, {"_id": 0}).to_list(100)
    
    for stat in stats:
        if isinstance(stat['timestamp'], str):
            stat['timestamp'] = datetime.fromisoformat(stat['timestamp'])
    
    return stats

@api_router.get("/stats/best")
async def get_best_stats():
    """Get best accuracy stats"""
    stats = await db.game_stats.find({}, {"_id": 0}).to_list(1000)
    
    best_stats = []
    for stat in stats:
        if stat['attempts'] > 0:
            accuracy = (stat['hits'] / stat['attempts']) * 100
            best_stats.append({
                "hits": stat['hits'],
                "attempts": stat['attempts'],
                "accuracy": round(accuracy, 1),
                "difficulty": stat['difficulty']
            })
    
    best_stats.sort(key=lambda x: x['accuracy'], reverse=True)
    return {"best_stats": best_stats[:10]}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
