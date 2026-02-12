import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Target, Play, RotateCcw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const SCALE = 4; // pixels per meter

const DIFFICULTY_SETTINGS = {
  easy: {
    wallMinHeight: 60,
    wallMaxHeight: 140,
    wallMinWidth: 10,
    wallMaxWidth: 20,
    wallMinX: 350,
    wallMaxX: 450,
    targetMinDist: 150,
    targetMaxDist: 250,
    ussrRetaliates: false,
  },
  medium: {
    wallMinHeight: 100,
    wallMaxHeight: 200,
    wallMinWidth: 15,
    wallMaxWidth: 30,
    wallMinX: 320,
    wallMaxX: 480,
    targetMinDist: 180,
    targetMaxDist: 280,
    ussrRetaliates: false,
  },
  hard: {
    wallMinHeight: 150,
    wallMaxHeight: 260,
    wallMinWidth: 20,
    wallMaxWidth: 40,
    wallMinX: 300,
    wallMaxX: 500,
    targetMinDist: 200,
    targetMaxDist: 320,
    ussrRetaliates: false,
  },
  total: {
    wallMinHeight: 150,
    wallMaxHeight: 280,
    wallMinWidth: 25,
    wallMaxWidth: 45,
    wallMinX: 280,
    wallMaxX: 520,
    targetMinDist: 220,
    targetMaxDist: 350,
    ussrRetaliates: true,
    ussrAccuracy: 0.5, // 50% chance
  },
};

export default function Game() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const [angle, setAngle] = useState(45);
  const [velocity, setVelocity] = useState(30);
  const [difficulty, setDifficulty] = useState("medium");
  const [hits, setHits] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [ussrHits, setUssrHits] = useState(0);
  const [ussrAttempts, setUssrAttempts] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [trajectory, setTrajectory] = useState([]);

  const [cannonPos] = useState({ x: 50, y: 30 });
  const [wallPos, setWallPos] = useState({ x: 400, y: 0, width: 20, height: 150 });
  const [targetPos, setTargetPos] = useState({ x: 900, y: 30, width: 60, height: 60 });
  const [mapImage, setMapImage] = useState(null);

  useEffect(() => {
    // Load world map image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "https://images.unsplash.com/photo-1742415105376-43d3a5fd03fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwyfHxmbGF0JTIwd29ybGQlMjBhdGxhcyUyMGNvbnRpbmVudHMlMjB2aW50YWdlfGVufDB8fHx8MTc3MDg5MjMxOHww&ixlib=rb-4.1.0&q=85&w=1200&h=600&fit=crop";
    img.onload = () => {
      setMapImage(img);
    };
  }, []);

  useEffect(() => {
    generateNewRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  const generateNewRound = () => {
    const settings = DIFFICULTY_SETTINGS[difficulty];
    
    // Random wall dimensions with MORE variation
    const wallHeight = Math.random() * (settings.wallMaxHeight - settings.wallMinHeight) + settings.wallMinHeight;
    const wallWidth = Math.random() * (settings.wallMaxWidth - settings.wallMinWidth) + settings.wallMinWidth;
    const wallX = Math.random() * (settings.wallMaxX - settings.wallMinX) + settings.wallMinX;
    
    // Random target distance with MORE variation
    const targetDist = Math.random() * (settings.targetMaxDist - settings.targetMinDist) + settings.targetMinDist;
    const targetX = wallX + wallWidth + targetDist;
    
    // Random target size for even more variation
    const targetWidth = 50 + Math.random() * 30; // 50-80 pixels
    const targetHeight = 50 + Math.random() * 30; // 50-80 pixels
    
    setWallPos({ x: wallX, y: 0, width: wallWidth, height: wallHeight });
    setTargetPos({ 
      x: targetX, 
      y: 30, 
      width: targetWidth, 
      height: targetHeight 
    });
    
    setTrajectory([]);
  };

  const drawCanvas = (ctx, projectilePos = null, trajectoryPath = []) => {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw world map image as background - Pacific centered projection
    if (mapImage) {
      ctx.globalAlpha = 0.6;
      // Draw the map shifted to show USA on left and USSR/Russia on right
      // Original image width is used, we shift it left to center on Pacific
      const mapWidth = mapImage.width;
      const mapHeight = mapImage.height;
      
      // Shift the image to the left so USA appears on left side and Asia on right
      // We'll draw the right portion of the map on the left, and left portion on right
      const shift = mapWidth * 0.25; // Shift to center on Pacific
      
      // Draw right portion of map on the left side of canvas
      ctx.drawImage(
        mapImage,
        mapWidth * 0.5, 0, mapWidth * 0.5, mapHeight, // Source: right half of map (Asia/Pacific)
        0, 0, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT // Destination: left half of canvas
      );
      
      // Draw left portion of map on the right side of canvas  
      ctx.drawImage(
        mapImage,
        0, 0, mapWidth * 0.5, mapHeight, // Source: left half of map (Americas)
        CANVAS_WIDTH * 0.5, 0, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT // Destination: right half of canvas
      );
      
      ctx.globalAlpha = 1.0;
    } else {
      // Fallback ocean gradient if image not loaded
      const oceanGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      oceanGradient.addColorStop(0, "#1a4d6d");
      oceanGradient.addColorStop(0.5, "#2563a8");
      oceanGradient.addColorStop(1, "#3d82b8");
      ctx.fillStyle = oceanGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    
    // Dark overlay for better contrast with game elements
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Latitude/longitude grid lines (military map style)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    // Latitude lines
    for (let y = 100; y < CANVAS_HEIGHT - 30; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    // Longitude lines
    for (let x = 100; x < CANVAS_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT - 30);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // Ground line (Earth surface)
    ctx.strokeStyle = "#1a3a4a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT - 30);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 30);
    ctx.stroke();
    
    // Draw trajectory path (missile trail) - USA in BLUE
    if (trajectoryPath.length > 0 && trajectoryPath[0].isUSSR !== true) {
      ctx.strokeStyle = "#4A90E2";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#0066FF";
      ctx.shadowBlur = 10;
      ctx.setLineDash([]);
      ctx.beginPath();
      trajectoryPath.forEach((point, index) => {
        const screenX = point.x;
        const screenY = CANVAS_HEIGHT - point.y - 30;
        if (index === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // Draw USSR trajectory in RED
    if (trajectoryPath.length > 0 && trajectoryPath[0].isUSSR === true) {
      ctx.strokeStyle = "#E23636";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#FF0000";
      ctx.shadowBlur = 10;
      ctx.setLineDash([]);
      ctx.beginPath();
      trajectoryPath.forEach((point, index) => {
        const screenX = point.x;
        const screenY = CANVAS_HEIGHT - point.y - 30;
        if (index === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    
    // Draw USA missile base (left - Estados Unidos)
    const cannonScreenX = cannonPos.x;
    const cannonScreenY = CANVAS_HEIGHT - 30;
    
    // USA Flag colors
    ctx.fillStyle = "#B22234"; // Red
    ctx.fillRect(cannonScreenX - 25, cannonScreenY - 50, 50, 30);
    
    // White stripes
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cannonScreenX - 25, cannonScreenY - 50 + i * 10, 50, 5);
    }
    
    // Blue canton
    ctx.fillStyle = "#3C3B6E";
    ctx.fillRect(cannonScreenX - 25, cannonScreenY - 50, 20, 15);
    
    // Stars (simplified)
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(cannonScreenX - 22 + (i % 4) * 4, cannonScreenY - 47 + Math.floor(i / 4) * 6, 2, 2);
    }
    
    // Missile launcher base
    ctx.fillStyle = "#2C3E50";
    ctx.fillRect(cannonScreenX - 15, cannonScreenY - 20, 30, 20);
    
    // Label USA
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("USA", cannonScreenX, cannonScreenY - 55);
    
    // Missile/barrel
    const angleRad = (angle * Math.PI) / 180;
    const barrelLength = 45;
    const barrelEndX = cannonScreenX + Math.cos(angleRad) * barrelLength;
    const barrelEndY = cannonScreenY - Math.sin(angleRad) * barrelLength;
    
    ctx.strokeStyle = "#34495E";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cannonScreenX, cannonScreenY - 10);
    ctx.lineTo(barrelEndX, barrelEndY);
    ctx.stroke();
    
    // Missile tip
    ctx.fillStyle = "#E74C3C";
    ctx.beginPath();
    ctx.arc(barrelEndX, barrelEndY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw obstacle (mountain range / geographic barrier)
    ctx.fillStyle = "#5D4E37"; // Brown mountains
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillRect(wallPos.x, CANVAS_HEIGHT - wallPos.height - 30, wallPos.width, wallPos.height);
    ctx.shadowBlur = 0;
    
    // Mountain peaks effect
    ctx.fillStyle = "#8B7355";
    ctx.beginPath();
    for (let i = 0; i < wallPos.width; i += 8) {
      ctx.moveTo(wallPos.x + i, CANVAS_HEIGHT - 30);
      ctx.lineTo(wallPos.x + i + 4, CANVAS_HEIGHT - wallPos.height - 30 - 10);
      ctx.lineTo(wallPos.x + i + 8, CANVAS_HEIGHT - 30);
    }
    ctx.fill();
    
    // Snow caps
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(wallPos.x + (wallPos.width / 4) * i, CANVAS_HEIGHT - wallPos.height - 30, wallPos.width / 4, 5);
    }
    
    // Draw USSR target (right - União Soviética)
    const targetScreenX = targetPos.x;
    const targetScreenY = CANVAS_HEIGHT - 30 - targetPos.height;
    
    // Soviet base building
    ctx.fillStyle = "#8B0000"; // Dark red
    ctx.fillRect(targetScreenX, targetScreenY + 20, targetPos.width, targetPos.height - 20);
    
    // Roof
    ctx.fillStyle = "#A52A2A";
    ctx.beginPath();
    ctx.moveTo(targetScreenX - 5, targetScreenY + 20);
    ctx.lineTo(targetScreenX + targetPos.width / 2, targetScreenY);
    ctx.lineTo(targetScreenX + targetPos.width + 5, targetScreenY + 20);
    ctx.closePath();
    ctx.fill();
    
    // Soviet flag on top
    ctx.fillStyle = "#CC0000"; // Bright red
    ctx.fillRect(targetScreenX + targetPos.width / 2 - 2, targetScreenY - 15, 2, 15);
    ctx.fillRect(targetScreenX + targetPos.width / 2, targetScreenY - 15, 20, 12);
    
    // Hammer and Sickle (simplified)
    ctx.fillStyle = "#FFD700"; // Gold
    ctx.font = "bold 10px Arial";
    ctx.fillText("☭", targetScreenX + targetPos.width / 2 + 7, targetScreenY - 5);
    
    // Windows
    ctx.fillStyle = "#FFD700";
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillRect(targetScreenX + 10 + i * 20, targetScreenY + 30 + j * 15, 8, 10);
      }
    }
    
    // Label USSR
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("СССР", targetScreenX + targetPos.width / 2, targetScreenY - 20);
    
    // Antenna/tower
    ctx.strokeStyle = "#8B0000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetScreenX + targetPos.width - 5, targetScreenY + 20);
    ctx.lineTo(targetScreenX + targetPos.width - 5, targetScreenY - 5);
    ctx.stroke();
    
    // Draw projectile (missile)
    if (projectilePos) {
      // Missile body
      ctx.fillStyle = "#2C3E50";
      ctx.beginPath();
      ctx.arc(projectilePos.x, CANVAS_HEIGHT - projectilePos.y - 30, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Missile glow/trail
      ctx.fillStyle = "rgba(255, 107, 107, 0.6)";
      ctx.beginPath();
      ctx.arc(projectilePos.x, CANVAS_HEIGHT - projectilePos.y - 30, 14, 0, Math.PI * 2);
      ctx.fill();
      
      // Fire trail
      ctx.fillStyle = "rgba(255, 165, 0, 0.5)";
      ctx.beginPath();
      ctx.arc(projectilePos.x - 5, CANVAS_HEIGHT - projectilePos.y - 30, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    drawCanvas(ctx, null, trajectory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angle, velocity, wallPos, targetPos, trajectory, mapImage]);

  const checkCollision = (x, y) => {
    // Check ground
    if (y <= 0) return { type: "ground" };
    
    // Check wall
    if (
      x >= wallPos.x &&
      x <= wallPos.x + wallPos.width &&
      y <= wallPos.height
    ) {
      return { type: "wall" };
    }
    
    // Check target - target is at ground level (y=30)
    if (
      x >= targetPos.x &&
      x <= targetPos.x + targetPos.width &&
      y >= 0 &&
      y <= targetPos.height
    ) {
      return { type: "target" };
    }
    
    return null;
  };

  const fireProjectile = async () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setAttempts(prev => prev + 1);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    // Calculate physics
    const angleRad = (angle * Math.PI) / 180;
    const vx = velocity * Math.cos(angleRad);
    const vy = velocity * Math.sin(angleRad);
    const g = 9.8;
    
    let t = 0;
    const dt = 0.016; // ~60fps
    const trajectoryPoints = [];
    let hitType = null;
    
    const animate = () => {
      const x = cannonPos.x + vx * SCALE * t;
      const y = cannonPos.y + vy * SCALE * t - 0.5 * g * SCALE * t * t;
      
      const collision = checkCollision(x, y);
      
      if (collision) {
        hitType = collision.type;
        trajectoryPoints.push({ x, y });
        setTrajectory(trajectoryPoints);
        
        // Draw animated mushroom cloud explosion for ALL impacts
        let explosionFrame = 0;
        const maxExplosionFrames = 60; // 1 second at 60fps
        const animateExplosion = () => {
          drawCanvas(ctx, null, trajectoryPoints);
          drawMushroomCloud(ctx, x, y, explosionFrame, maxExplosionFrames);
          explosionFrame++;
          
          if (explosionFrame < maxExplosionFrames) {
            requestAnimationFrame(animateExplosion);
          }
        };
        animateExplosion();
        
        if (hitType === "target") {
          setHits(prev => prev + 1);
          toast.success("Alvo Soviético Destruído! 🎯", {
            description: `Explosão nuclear confirmada!`,
            icon: <Target className="h-5 w-5" />,
          });
          
          setTimeout(() => {
            setTrajectory([]);
            generateNewRound();
            toast.info("Nova Localização URSS!", {
              description: "Base soviética reposicionada",
            });
          }, 3000);
        } else if (hitType === "wall") {
          toast.error("Bloqueado por obstáculo geográfico!", {
            description: "Explosão na montanha",
          });
        } else {
          toast.info("Míssil perdido", {
            description: "Explosão em território neutro",
          });
        }
        
        setIsAnimating(false);
        
        // USSR retaliation in "Guerra Total" mode
        const settings = DIFFICULTY_SETTINGS[difficulty];
        if (settings.ussrRetaliates && hitType !== "target") {
          setTimeout(() => {
            ussrRetaliate();
          }, 2000);
        }
        
        return;
      }
      
      trajectoryPoints.push({ x, y });
      drawCanvas(ctx, { x, y }, trajectoryPoints);
      
      t += dt;
      
      if (t < 10) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setTrajectory(trajectoryPoints);
        setIsAnimating(false);
        toast.info("Projétil perdido", {
          description: "Fora do alcance",
        });
      }
    };
    
    animate();
  };

  const drawMushroomCloud = (ctx, x, y, frame, maxFrames) => {
    const progress = frame / maxFrames;
    const size = 40 * (1 + progress * 2); // Grows over time
    
    // Explosion flash (first few frames)
    if (frame < 8) {
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - frame / 8})`;
      ctx.beginPath();
      ctx.arc(x, CANVAS_HEIGHT - y - 30, size * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Fireball
    const fireballGradient = ctx.createRadialGradient(x, CANVAS_HEIGHT - y - 30, 0, x, CANVAS_HEIGHT - y - 30, size);
    fireballGradient.addColorStop(0, `rgba(255, 255, 200, ${1 - progress * 0.7})`);
    fireballGradient.addColorStop(0.3, `rgba(255, 150, 0, ${1 - progress * 0.5})`);
    fireballGradient.addColorStop(0.6, `rgba(255, 50, 0, ${1 - progress * 0.6})`);
    fireballGradient.addColorStop(1, `rgba(100, 0, 0, ${1 - progress})`);
    
    ctx.fillStyle = fireballGradient;
    ctx.beginPath();
    ctx.arc(x, CANVAS_HEIGHT - y - 30, size, 0, Math.PI * 2);
    ctx.fill();
    
    // Mushroom stem (rises up)
    if (progress > 0.2) {
      const stemHeight = size * 2 * (progress - 0.2);
      const stemWidth = size * 0.4;
      
      ctx.fillStyle = `rgba(80, 40, 20, ${0.8 - progress * 0.5})`;
      ctx.fillRect(
        x - stemWidth / 2,
        CANVAS_HEIGHT - y - 30 - stemHeight,
        stemWidth,
        stemHeight
      );
      
      // Smoke on stem
      ctx.fillStyle = `rgba(60, 60, 60, ${0.6 - progress * 0.4})`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(
          x + (Math.random() - 0.5) * stemWidth,
          CANVAS_HEIGHT - y - 30 - stemHeight * (0.3 + i * 0.3),
          stemWidth * 0.6,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    
    // Mushroom cap (forms at top)
    if (progress > 0.4) {
      const capProgress = (progress - 0.4) / 0.6;
      const capRadius = size * 1.5 * capProgress;
      const capY = CANVAS_HEIGHT - y - 30 - size * 2.5 * progress;
      
      // Main cap
      ctx.fillStyle = `rgba(139, 69, 19, ${0.9 - progress * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, capY, capRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Cap shadow/detail
      ctx.fillStyle = `rgba(90, 50, 20, ${0.7 - progress * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, capY + capRadius * 0.3, capRadius * 0.8, 0, Math.PI);
      ctx.fill();
      
      // Smoke clouds around cap
      ctx.fillStyle = `rgba(80, 80, 80, ${0.5 - progress * 0.3})`;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const cloudX = x + Math.cos(angle) * capRadius * 0.8;
        const cloudY = capY + Math.sin(angle) * capRadius * 0.8;
        ctx.beginPath();
        ctx.arc(cloudX, cloudY, capRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Debris particles
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const distance = size * progress * 2;
      const particleX = x + Math.cos(angle) * distance;
      const particleY = CANVAS_HEIGHT - y - 30 + Math.sin(angle) * distance - progress * 50;
      
      ctx.fillStyle = `rgba(255, 100, 0, ${1 - progress})`;
      ctx.beginPath();
      ctx.arc(particleX, particleY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const ussrRetaliate = () => {
    setUssrAttempts(prev => prev + 1);
    toast.warning("⚠️ URSS Revidando!", {
      description: "Míssil soviético lançado!",
    });
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const willHit = Math.random() < settings.ussrAccuracy;
    
    // Calculate angle and velocity for USSR missile (from right to left)
    // USSR shoots from targetPos toward cannonPos
    const distanceX = targetPos.x - cannonPos.x;
    const targetY = 30; // USA base at ground level
    
    let ussrAngle, ussrVelocity;
    
    if (willHit) {
      // Calculate to hit USA base (50% chance)
      // Use physics: range = v^2 * sin(2*theta) / g
      const g = 9.8;
      const targetRange = distanceX / SCALE;
      
      // Choose a random velocity between 40-70 m/s
      ussrVelocity = 40 + Math.random() * 30;
      
      // Calculate angle to hit target
      // sin(2*theta) = g * range / v^2
      const sinValue = (g * targetRange) / (ussrVelocity * ussrVelocity);
      
      if (sinValue <= 1 && sinValue >= -1) {
        const angle2theta = Math.asin(sinValue);
        ussrAngle = (angle2theta / 2) * (180 / Math.PI);
        
        // Add small random variation
        ussrAngle += (Math.random() - 0.5) * 5;
      } else {
        // If calculation fails, use reasonable guess
        ussrAngle = 40 + Math.random() * 15;
      }
    } else {
      // Miss intentionally (50% chance)
      // Random angle and velocity that will miss
      ussrAngle = 20 + Math.random() * 60;
      ussrVelocity = 30 + Math.random() * 50;
      
      // Bias to make it miss
      if (Math.random() > 0.5) {
        ussrAngle *= 0.7; // Too low
      } else {
        ussrVelocity *= 0.8; // Too slow
      }
    }
    
    // Animate USSR missile
    const angleRad = (ussrAngle * Math.PI) / 180;
    const vx = -ussrVelocity * Math.cos(angleRad); // Negative because going left
    const vy = ussrVelocity * Math.sin(angleRad);
    const g = 9.8;
    
    let t = 0;
    const dt = 0.016;
    const ussrTrajectoryPoints = [];
    let ussrHitType = null;
    
    const animateUSSR = () => {
      const x = targetPos.x + vx * SCALE * t;
      const y = targetPos.y + vy * SCALE * t - 0.5 * g * SCALE * t * t;
      
      // Check collision with ground
      if (y <= 0) {
        ussrHitType = "ground";
      }
      
      // Check collision with wall (from right side)
      if (!ussrHitType && x >= wallPos.x && x <= wallPos.x + wallPos.width && y <= wallPos.height) {
        ussrHitType = "wall";
      }
      
      // Check collision with USA base
      if (!ussrHitType && x >= cannonPos.x - 30 && x <= cannonPos.x + 30 && y >= 0 && y <= 50) {
        ussrHitType = "usa";
      }
      
      if (ussrHitType) {
        ussrTrajectoryPoints.push({ x, y });
        ussrTrajectoryPoints[0].isUSSR = true; // Mark as USSR trajectory for red color
        
        // Animate mushroom cloud explosion for ALL USSR impacts
        let explosionFrame = 0;
        const maxExplosionFrames = 60;
        const animateExplosion = () => {
          drawCanvas(ctx, null, ussrTrajectoryPoints);
          drawMushroomCloud(ctx, x, y, explosionFrame, maxExplosionFrames);
          explosionFrame++;
          
          if (explosionFrame < maxExplosionFrames) {
            requestAnimationFrame(animateExplosion);
          }
        };
        animateExplosion();
        
        if (ussrHitType === "usa") {
          setUssrHits(prev => prev + 1);
          toast.error("💥 Base Americana Atingida!", {
            description: "URSS marcou ponto!",
          });
        } else if (ussrHitType === "wall") {
          toast.info("Míssil soviético bloqueado", {
            description: "Explosão no obstáculo",
          });
        } else {
          toast.info("Míssil soviético errou", {
            description: "Explosão em território neutro",
          });
        }
        
        setTimeout(() => {
          setTrajectory([]);
        }, 3000);
        
        return;
      }
      
      ussrTrajectoryPoints.push({ x, y });
      
      // Draw USSR missile in red
      drawCanvas(ctx, null, []);
      
      // Draw USSR missile
      ctx.fillStyle = "#E23636";
      ctx.beginPath();
      ctx.arc(x, CANVAS_HEIGHT - y - 30, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = "rgba(226, 54, 54, 0.6)";
      ctx.beginPath();
      ctx.arc(x, CANVAS_HEIGHT - y - 30, 14, 0, Math.PI * 2);
      ctx.fill();
      
      // USSR trajectory in RED
      if (ussrTrajectoryPoints.length > 1) {
        ctx.strokeStyle = "#E23636";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#FF0000";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ussrTrajectoryPoints.forEach((point, index) => {
          const screenX = point.x;
          const screenY = CANVAS_HEIGHT - point.y - 30;
          if (index === 0) {
            ctx.moveTo(screenX, screenY);
          } else {
            ctx.lineTo(screenX, screenY);
          }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      
      t += dt;
      
      if (t < 10 && x > -50) {
        animationRef.current = requestAnimationFrame(animateUSSR);
      } else {
        // Missed completely
        toast.info("Míssil soviético perdido");
        setTimeout(() => {
          setTrajectory([]);
        }, 1000);
      }
    };
    
    animateUSSR();
  };

  const resetGame = () => {
    setHits(0);
    setAttempts(0);
    setUssrHits(0);
    setUssrAttempts(0);
    generateNewRound();
    toast.info("Missão reiniciada!");
  };

  const accuracy = attempts > 0 ? ((hits / attempts) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Guerra Fria: Cálculo Balístico
          </h1>
          <p className="text-sm text-slate-500 mt-1">USA 🇺🇸 vs URSS 🚩 | Simulador de Mísseis Intercontinentais</p>
        </div>
        <div className="flex items-center gap-4">
          {difficulty === "total" ? (
            <>
              <div className="bg-blue-600 rounded-xl px-6 py-3 shadow-sm border-2 border-blue-700">
                <div className="text-xs uppercase tracking-wider text-white mb-1">🇺🇸 USA</div>
                <div className="text-2xl font-bold text-white font-mono">{hits}</div>
              </div>
              <div className="text-3xl font-bold text-slate-700">VS</div>
              <div className="bg-red-600 rounded-xl px-6 py-3 shadow-sm border-2 border-red-700">
                <div className="text-xs uppercase tracking-wider text-white mb-1">🚩 CCCP</div>
                <div className="text-2xl font-bold text-white font-mono">{ussrHits}</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl px-6 py-3 shadow-sm border border-slate-200">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Taxa de Acerto</div>
                <div className="text-2xl font-bold text-indigo-600 font-mono">{accuracy}%</div>
              </div>
              <div className="bg-white rounded-xl px-6 py-3 shadow-sm border border-slate-200">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Alvos Atingidos</div>
                <div className="text-2xl font-bold text-green-600 font-mono">{hits}/{attempts}</div>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[calc(100vh-200px)]">
        {/* Canvas Area */}
        <div className="lg:col-span-9 bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-auto border border-slate-100 rounded-lg"
            data-testid="game-canvas"
          />
        </div>

        {/* Controls Sidebar */}
        <div className="lg:col-span-3 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200 p-6 flex flex-col gap-4 overflow-y-auto">
          {/* Difficulty Selector */}
          <div>
            <label className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3 block">
              Dificuldade
            </label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-full" data-testid="difficulty-select">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Fácil</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="hard">Difícil</SelectItem>
                <SelectItem value="total">Guerra Total 🔥</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Angle Control */}
          <div>
            <label className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3 block">
              Ângulo de Lançamento
            </label>
            <div className="flex items-center gap-4">
              <Slider
                value={[angle]}
                onValueChange={(val) => setAngle(val[0])}
                min={0}
                max={90}
                step={1}
                className="flex-1"
                disabled={isAnimating}
                data-testid="angle-slider"
              />
              <div className="text-2xl font-mono font-bold text-indigo-600 w-16 text-right">
                {angle}°
              </div>
            </div>
          </div>

          {/* Velocity Control */}
          <div>
            <label className="text-sm font-medium uppercase tracking-wider text-slate-500 mb-3 block">
              Velocidade do Míssil
            </label>
            <div className="flex items-center gap-4">
              <Slider
                value={[velocity]}
                onValueChange={(val) => setVelocity(val[0])}
                min={10}
                max={80}
                step={1}
                className="flex-1"
                disabled={isAnimating}
                data-testid="velocity-slider"
              />
              <div className="text-2xl font-mono font-bold text-indigo-600 w-16 text-right">
                {velocity}
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-1">m/s</div>
          </div>

          {/* Fire Button */}
          <Button
            onClick={fireProjectile}
            disabled={isAnimating}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-bold rounded-full shadow-lg hover:shadow-xl transition-all active:scale-95"
            data-testid="fire-button"
          >
            <Play className="mr-2 h-5 w-5" />
            {isAnimating ? "Míssil em voo..." : "Lançar Míssil"}
          </Button>

          {/* Reset Button */}
          <Button
            onClick={resetGame}
            variant="outline"
            className="w-full border-2 border-slate-200 hover:bg-slate-50 py-3 rounded-xl"
            data-testid="reset-button"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar Missão
          </Button>

          {/* Stats Card */}
          <div className="pt-4 border-t border-slate-200">
            <div className="bg-gradient-to-br from-indigo-50 to-rose-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-red-600" />
                <span className="text-xs uppercase tracking-wider text-slate-600 font-medium">
                  {difficulty === "total" ? "Placar da Guerra" : "Relatório de Missão"}
                </span>
              </div>
              {difficulty === "total" ? (
                <div className="space-y-3 text-sm">
                  <div className="bg-blue-100 p-2 rounded">
                    <div className="font-bold text-blue-900 mb-1">🇺🇸 Estados Unidos</div>
                    <div className="flex justify-between text-xs">
                      <span>Acertos:</span>
                      <span className="font-bold">{hits}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Disparos:</span>
                      <span className="font-bold">{attempts}</span>
                    </div>
                  </div>
                  <div className="bg-red-100 p-2 rounded">
                    <div className="font-bold text-red-900 mb-1">🚩 União Soviética</div>
                    <div className="flex justify-between text-xs">
                      <span>Acertos:</span>
                      <span className="font-bold">{ussrHits}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Disparos:</span>
                      <span className="font-bold">{ussrAttempts}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Lançamentos:</span>
                    <span className="font-bold text-slate-900">{attempts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Alvos Destruídos:</span>
                    <span className="font-bold text-green-600">{hits}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Falhas:</span>
                    <span className="font-bold text-rose-600">{attempts - hits}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
