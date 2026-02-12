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
  
  // Unified projectile management for simultaneous missile flights
  const projectilesRef = useRef([]); // Array of active projectiles: { id, x, y, vx, vy, t, isUSSR, trajectoryPoints, active }
  const explosionsRef = useRef([]); // Array of active explosions: { x, y, frame, maxFrames }

  const [cannonPos] = useState({ x: 50, y: 30 });
  const [wallPos, setWallPos] = useState({ x: 400, y: 0, width: 20, height: 150 });
  const [targetPos, setTargetPos] = useState({ x: 900, y: 30, width: 60, height: 60 });
  const [lastHitPos, setLastHitPos] = useState(null); // Track last successful hit position
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

  const generateNewRound = (wasHit = false) => {
    const settings = DIFFICULTY_SETTINGS[difficulty];
    
    let wallX, wallHeight, wallWidth, targetX, targetDist;
    let attempts = 0;
    const maxAttempts = 20;
    
    do {
      // Random wall dimensions
      wallHeight = Math.random() * (settings.wallMaxHeight - settings.wallMinHeight) + settings.wallMinHeight;
      wallWidth = Math.random() * (settings.wallMaxWidth - settings.wallMinWidth) + settings.wallMinWidth;
      wallX = Math.random() * (settings.wallMaxX - settings.wallMinX) + settings.wallMinX;
      
      // Random target distance
      targetDist = Math.random() * (settings.targetMaxDist - settings.targetMinDist) + settings.targetMinDist;
      targetX = wallX + wallWidth + targetDist;
      
      // If last position was hit, ensure new position is significantly different
      if (wasHit && lastHitPos) {
        const distanceFromLast = Math.abs(targetX - lastHitPos.x);
        // Require at least 350 pixels difference from last hit position (increased from 250)
        if (distanceFromLast < 350) {
          attempts++;
          continue; // Try again
        }
        
        // Also vary wall position more dramatically after hit
        const wallDistanceFromLast = Math.abs(wallX - lastHitPos.wallX);
        // Require at least 150 pixels difference for wall (increased from 100)
        if (wallDistanceFromLast < 150) {
          attempts++;
          continue; // Try again
        }
      }
      
      break; // Position is acceptable
    } while (attempts < maxAttempts);
    
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
    
    // Store position for next round comparison
    if (wasHit) {
      setLastHitPos({ x: targetX, wallX: wallX });
    }
    
    setTrajectory([]);
  };

  // Draw a single missile (shared between USA and USSR)
  const drawMissile = (ctx, x, y, trajectoryPoints, isUSSR) => {
    // Calculate missile rotation angle based on trajectory direction
    const missiles = trajectoryPoints.slice(-2);
    let missileAngle = isUSSR ? Math.PI : 0; // Default direction
    if (missiles.length >= 2) {
      const dx = missiles[1].x - missiles[0].x;
      const dy = missiles[1].y - missiles[0].y;
      missileAngle = Math.atan2(-dy, dx);
    }
    
    const missileX = x;
    const missileY = CANVAS_HEIGHT - y - 30;
    
    ctx.save();
    ctx.translate(missileX, missileY);
    ctx.rotate(missileAngle);
    
    if (isUSSR) {
      // USSR Missile body (red)
      ctx.fillStyle = "#E23636";
      ctx.fillRect(-12, -4, 24, 8);
      
      // Nose cone
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.lineTo(18, 0);
      ctx.lineTo(12, 4);
      ctx.closePath();
      ctx.fillStyle = "#B22222";
      ctx.fill();
      
      // Tail fins
      ctx.fillStyle = "#FF4444";
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-18, -8);
      ctx.lineTo(-15, -4);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(-18, 8);
      ctx.lineTo(-15, 4);
      ctx.closePath();
      ctx.fill();
      
      // Yellow stripe
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(0, -3, 8, 6);
      
      // Flame trail
      ctx.fillStyle = "rgba(255, 100, 50, 0.8)";
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.lineTo(-20, 0);
      ctx.lineTo(-12, 2);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = "rgba(255, 150, 100, 0.6)";
      ctx.beginPath();
      ctx.moveTo(-12, -1);
      ctx.lineTo(-16, 0);
      ctx.lineTo(-12, 1);
      ctx.closePath();
      ctx.fill();
    } else {
      // USA Missile body (blue)
      ctx.fillStyle = "#4A90E2";
      ctx.fillRect(-12, -4, 24, 8);
      
      // Nose cone
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.lineTo(18, 0);
      ctx.lineTo(12, 4);
      ctx.closePath();
      ctx.fillStyle = "#2C5F8D";
      ctx.fill();
      
      // Tail fins
      ctx.fillStyle = "#5BA3E8";
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-18, -8);
      ctx.lineTo(-15, -4);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(-18, 8);
      ctx.lineTo(-15, 4);
      ctx.closePath();
      ctx.fill();
      
      // White stripe
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, -3, 8, 6);
      
      // Flame trail
      ctx.fillStyle = "rgba(255, 150, 50, 0.8)";
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.lineTo(-20, 0);
      ctx.lineTo(-12, 2);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = "rgba(255, 200, 100, 0.6)";
      ctx.beginPath();
      ctx.moveTo(-12, -1);
      ctx.lineTo(-16, 0);
      ctx.lineTo(-12, 1);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore();
    
    // Glow effect
    ctx.fillStyle = isUSSR ? "rgba(226, 54, 54, 0.3)" : "rgba(74, 144, 226, 0.3)";
    ctx.beginPath();
    ctx.arc(missileX, missileY, 12, 0, Math.PI * 2);
    ctx.fill();
  };

  // Draw trajectory trail
  const drawTrajectoryTrail = (ctx, trajectoryPoints, isUSSR) => {
    if (trajectoryPoints.length < 2) return;
    
    ctx.strokeStyle = isUSSR ? "#E23636" : "#4A90E2";
    ctx.lineWidth = 3;
    ctx.shadowColor = isUSSR ? "#FF0000" : "#0066FF";
    ctx.shadowBlur = 10;
    ctx.setLineDash([]);
    ctx.beginPath();
    trajectoryPoints.forEach((point, index) => {
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
  };

  const drawCanvas = (ctx, activeProjectiles = [], activeExplosions = []) => {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw world map image as background - Pacific centered projection
    if (mapImage) {
      ctx.globalAlpha = 0.6;
      const mapWidth = mapImage.width;
      const mapHeight = mapImage.height;
      
      // Draw right portion of map on the left side of canvas
      ctx.drawImage(
        mapImage,
        mapWidth * 0.5, 0, mapWidth * 0.5, mapHeight,
        0, 0, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT
      );
      
      // Draw left portion of map on the right side of canvas  
      ctx.drawImage(
        mapImage,
        0, 0, mapWidth * 0.5, mapHeight,
        CANVAS_WIDTH * 0.5, 0, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT
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
    for (let y = 100; y < CANVAS_HEIGHT - 30; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
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
    
    // Draw all trajectory trails
    activeProjectiles.forEach(proj => {
      if (proj.trajectoryPoints && proj.trajectoryPoints.length > 1) {
        drawTrajectoryTrail(ctx, proj.trajectoryPoints, proj.isUSSR);
      }
    });
    
    // Also draw stored trajectory (for after missiles have landed)
    if (trajectory.length > 0) {
      const isUSSR = trajectory[0]?.isUSSR === true;
      drawTrajectoryTrail(ctx, trajectory, isUSSR);
    }
    
    // Draw USA missile launch tower (left)
    const cannonScreenX = cannonPos.x;
    const cannonScreenY = CANVAS_HEIGHT - 30;
    
    // Tower base platform
    ctx.fillStyle = "#2C3E50";
    ctx.fillRect(cannonScreenX - 35, cannonScreenY - 5, 70, 5);
    ctx.fillRect(cannonScreenX - 30, cannonScreenY - 10, 60, 5);
    
    // Support pillars
    ctx.fillStyle = "#34495E";
    ctx.fillRect(cannonScreenX - 25, cannonScreenY - 35, 8, 30);
    ctx.fillRect(cannonScreenX + 17, cannonScreenY - 35, 8, 30);
    
    // Main tower structure
    ctx.fillStyle = "#34495E";
    ctx.fillRect(cannonScreenX - 15, cannonScreenY - 60, 30, 25);
    
    // Tower details (panels)
    ctx.strokeStyle = "#4A5F7F";
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cannonScreenX - 15, cannonScreenY - 45 - i * 10);
      ctx.lineTo(cannonScreenX + 15, cannonScreenY - 45 - i * 10);
      ctx.stroke();
    }
    
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(cannonScreenX - 5, cannonScreenY - 60);
    ctx.lineTo(cannonScreenX - 5, cannonScreenY - 35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cannonScreenX + 5, cannonScreenY - 60);
    ctx.lineTo(cannonScreenX + 5, cannonScreenY - 35);
    ctx.stroke();
    
    // Radar dish on top
    ctx.fillStyle = "#5A6F8F";
    ctx.beginPath();
    ctx.ellipse(cannonScreenX, cannonScreenY - 65, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Antenna
    ctx.strokeStyle = "#7F8C8D";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cannonScreenX, cannonScreenY - 65);
    ctx.lineTo(cannonScreenX, cannonScreenY - 80);
    ctx.stroke();
    
    // Red warning light
    ctx.fillStyle = "#E74C3C";
    ctx.beginPath();
    ctx.arc(cannonScreenX, cannonScreenY - 80, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // USA Flag on tower
    ctx.fillStyle = "#B22234";
    ctx.fillRect(cannonScreenX - 18, cannonScreenY - 58, 6, 20);
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cannonScreenX - 18, cannonScreenY - 58 + i * 8, 6, 3);
    }
    ctx.fillStyle = "#3C3B6E";
    ctx.fillRect(cannonScreenX - 18, cannonScreenY - 58, 6, 10);
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cannonScreenX - 16 + (i % 2) * 3, cannonScreenY - 55 + Math.floor(i / 2) * 4, 1.5, 1.5);
    }
    
    // Label USA
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("USA", cannonScreenX, cannonScreenY - 85);
    
    // MISSILE positioned at launch angle (when not firing)
    if (!isAnimating) {
      const angleRad = (angle * Math.PI) / 180;
      const launchPointY = cannonScreenY - 32;
      
      ctx.save();
      ctx.translate(cannonScreenX, launchPointY);
      // Rotate 90 degrees more to make missile perpendicular, then flip 180 to invert direction
      ctx.rotate(angleRad + Math.PI / 2 + Math.PI);
      
      // Draw the missile standing perpendicular to launch angle (inverted)
      const missileLength = 35;
      const missileStart = 5;
      
      // Main missile body with gradient
      const bodyGradient = ctx.createLinearGradient(missileStart, 0, missileStart + missileLength, 0);
      bodyGradient.addColorStop(0, "#5BA3E8");
      bodyGradient.addColorStop(0.5, "#FFFFFF");
      bodyGradient.addColorStop(1, "#4A90E2");
      ctx.fillStyle = bodyGradient;
      ctx.fillRect(missileStart, -5, missileLength - 6, 10);
      
      // Nose cone
      ctx.fillStyle = "#2C5F8D";
      ctx.beginPath();
      ctx.moveTo(missileStart + missileLength - 6, -5);
      ctx.lineTo(missileStart + missileLength + 5, 0);
      ctx.lineTo(missileStart + missileLength - 6, 5);
      ctx.closePath();
      ctx.fill();
      
      // Nose cone highlight
      ctx.fillStyle = "#3D7AB8";
      ctx.beginPath();
      ctx.moveTo(missileStart + missileLength - 6, -2.5);
      ctx.lineTo(missileStart + missileLength + 5, 0);
      ctx.lineTo(missileStart + missileLength - 6, 2.5);
      ctx.closePath();
      ctx.fill();
      
      // Tail fins
      ctx.fillStyle = "#4A90E2";
      // Top fin
      ctx.beginPath();
      ctx.moveTo(missileStart, -5);
      ctx.lineTo(missileStart - 6, -9);
      ctx.lineTo(missileStart + 5, -5);
      ctx.closePath();
      ctx.fill();
      
      // Bottom fin
      ctx.beginPath();
      ctx.moveTo(missileStart, 5);
      ctx.lineTo(missileStart - 6, 9);
      ctx.lineTo(missileStart + 5, 5);
      ctx.closePath();
      ctx.fill();
      
      // Mid fins
      ctx.fillStyle = "#5BA3E8";
      ctx.fillRect(missileStart + 3, -6, 4, 2);
      ctx.fillRect(missileStart + 3, 4, 4, 2);
      
      // USA markings
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(missileStart + 16, -4, 10, 8);
      
      ctx.fillStyle = "#E74C3C";
      ctx.fillRect(missileStart + 18, -3, 6, 6);
      
      // Detail lines
      ctx.strokeStyle = "#2C5F8D";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(missileStart + 12 + i * 6, -5);
        ctx.lineTo(missileStart + 12 + i * 6, 5);
        ctx.stroke();
      }
      
      // Exhaust nozzle
      ctx.fillStyle = "#1A3A4A";
      ctx.fillRect(missileStart - 3, -4, 4, 8);
      
      ctx.fillStyle = "#34495E";
      ctx.fillRect(missileStart - 2, -3, 3, 6);
      
      // Glow effect behind missile
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#4A90E2";
      ctx.fillRect(missileStart, -7, missileLength - 6, 14);
      ctx.globalAlpha = 1.0;
      
      ctx.restore();
    }
    
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
    
    // Draw USSR target/base (right - União Soviética)
    const targetScreenX = targetPos.x;
    const targetScreenY = CANVAS_HEIGHT - 30 - targetPos.height;
    
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const isGuerraTotal = settings.ussrRetaliates;
    
    if (isGuerraTotal) {
      // USSR Missile Launch Tower (Guerra Total mode)
      const towerCenterX = targetScreenX + targetPos.width / 2;
      const towerBaseY = CANVAS_HEIGHT - 30;
      
      // Tower base platform
      ctx.fillStyle = "#8B0000";
      ctx.fillRect(towerCenterX - 30, towerBaseY - 10, 60, 10);
      
      // Main tower structure
      ctx.fillStyle = "#A52A2A";
      ctx.fillRect(towerCenterX - 15, towerBaseY - 60, 30, 50);
      
      // Tower details (panels)
      ctx.strokeStyle = "#CD5C5C";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(towerCenterX - 15, towerBaseY - 15 - i * 12);
        ctx.lineTo(towerCenterX + 15, towerBaseY - 15 - i * 12);
        ctx.stroke();
      }
      
      // Vertical lines
      ctx.beginPath();
      ctx.moveTo(towerCenterX - 5, towerBaseY - 60);
      ctx.lineTo(towerCenterX - 5, towerBaseY - 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(towerCenterX + 5, towerBaseY - 60);
      ctx.lineTo(towerCenterX + 5, towerBaseY - 10);
      ctx.stroke();
      
      // Radar dish on top
      ctx.fillStyle = "#DC143C";
      ctx.beginPath();
      ctx.ellipse(towerCenterX, towerBaseY - 65, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Antenna
      ctx.strokeStyle = "#8B0000";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(towerCenterX, towerBaseY - 65);
      ctx.lineTo(towerCenterX, towerBaseY - 80);
      ctx.stroke();
      
      // Red star on antenna
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("★", towerCenterX, towerBaseY - 76);
      
      // Soviet flag on tower side
      ctx.fillStyle = "#CC0000";
      ctx.fillRect(towerCenterX + 12, towerBaseY - 58, 6, 20);
      
      // Hammer and Sickle
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 10px Arial";
      ctx.fillText("☭", towerCenterX + 15, towerBaseY - 45);
      
      // Label USSR
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 12px Arial";
      ctx.fillText("СССР", towerCenterX, towerBaseY - 85);
      
      // Missile storage indicators (small rectangles)
      ctx.fillStyle = "#FFD700";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(towerCenterX - 12 + i * 8, towerBaseY - 25, 6, 10);
      }
      
    } else {
      // Original building design (non-Guerra Total modes)
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
    }
    
    // Draw all active missiles
    activeProjectiles.forEach(proj => {
      if (proj.active && proj.trajectoryPoints && proj.trajectoryPoints.length > 0) {
        drawMissile(ctx, proj.x, proj.y, proj.trajectoryPoints, proj.isUSSR);
      }
    });
    
    // Draw all active explosions
    activeExplosions.forEach(explosion => {
      drawMushroomCloud(ctx, explosion.x, explosion.y, explosion.frame, explosion.maxFrames);
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    drawCanvas(ctx, projectilesRef.current, explosionsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angle, velocity, wallPos, targetPos, trajectory, mapImage]);

  const checkCollisionForUSA = (x, y) => {
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

  const checkCollisionForUSSR = (x, y) => {
    // Check ground
    if (y <= 0) return { type: "ground" };
    
    // Check wall (from right side)
    if (x >= wallPos.x && x <= wallPos.x + wallPos.width && y <= wallPos.height) {
      return { type: "wall" };
    }
    
    // Check collision with USA base
    if (x >= cannonPos.x - 30 && x <= cannonPos.x + 30 && y >= 0 && y <= 50) {
      return { type: "usa" };
    }
    
    return null;
  };

  // Unified animation loop for all projectiles
  const runGameLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const g = 9.8;
    const dt = 0.016;
    
    let hasActiveProjectiles = false;
    
    // Update all projectiles
    projectilesRef.current.forEach(proj => {
      if (!proj.active) return;
      hasActiveProjectiles = true;
      
      proj.t += dt;
      
      // Calculate new position
      proj.x = proj.startX + proj.vx * SCALE * proj.t;
      proj.y = proj.startY + proj.vy * SCALE * proj.t - 0.5 * g * SCALE * proj.t * proj.t;
      
      proj.trajectoryPoints.push({ x: proj.x, y: proj.y, isUSSR: proj.isUSSR });
      
      // Check collision
      const collision = proj.isUSSR 
        ? checkCollisionForUSSR(proj.x, proj.y)
        : checkCollisionForUSA(proj.x, proj.y);
      
      if (collision || proj.t >= 10 || (proj.isUSSR && proj.x < -50) || (!proj.isUSSR && proj.x > CANVAS_WIDTH + 50)) {
        proj.active = false;
        
        // Handle collision
        if (collision) {
          handleProjectileImpact(proj, collision);
        } else {
          // Missed completely
          if (proj.isUSSR) {
            toast.info("Míssil soviético perdido");
          } else {
            toast.info("Projétil perdido", { description: "Fora do alcance" });
            setIsAnimating(false);
          }
        }
      }
    });
    
    // Update explosions
    explosionsRef.current = explosionsRef.current.filter(exp => {
      exp.frame++;
      return exp.frame < exp.maxFrames;
    });
    
    // Draw everything
    drawCanvas(ctx, projectilesRef.current, explosionsRef.current);
    
    // Continue loop if there are active projectiles or explosions
    if (hasActiveProjectiles || explosionsRef.current.length > 0) {
      animationRef.current = requestAnimationFrame(runGameLoop);
    } else {
      // Clean up finished projectiles
      projectilesRef.current = projectilesRef.current.filter(p => p.active);
    }
  };

  const handleProjectileImpact = (proj, collision) => {
    const { x, y, isUSSR } = proj;
    let hitType = collision.type;
    
    // Check explosion radius for area damage
    const explosionRadius = 80;
    
    if (isUSSR) {
      // USSR missile - check if explosion hits USA base
      const distanceToUSA = Math.sqrt(
        Math.pow(x - cannonPos.x, 2) + 
        Math.pow(y - cannonPos.y, 2)
      );
      
      const usaHitByExplosion = distanceToUSA < explosionRadius;
      
      if (usaHitByExplosion && hitType !== "usa") {
        hitType = "usa";
        toast.error("💥 Base Americana Atingida pela Explosão!", {
          description: "Onda de choque nuclear!",
        });
      }
      
      // Add explosion
      explosionsRef.current.push({ x, y, frame: 0, maxFrames: 60 });
      
      if (hitType === "usa") {
        setUssrHits(prev => prev + 1);
        if (!usaHitByExplosion) {
          toast.error("💥 Base Americana Atingida!", {
            description: "URSS marcou ponto!",
          });
        }
      } else if (hitType === "wall") {
        toast.info("Míssil soviético bloqueado", {
          description: "Explosão no obstáculo",
        });
      } else {
        toast.info("Míssil soviético errou", {
          description: "Explosão em território neutro",
        });
      }
      
      // Store trajectory for display
      const ussrTraj = proj.trajectoryPoints.map(p => ({ ...p, isUSSR: true }));
      setTrajectory(prev => [...prev, ...ussrTraj]);
      
    } else {
      // USA missile - check if explosion hits USSR target
      const distanceToTarget = Math.sqrt(
        Math.pow(x - (targetPos.x + targetPos.width / 2), 2) + 
        Math.pow(y - targetPos.height / 2, 2)
      );
      
      const targetHitByExplosion = distanceToTarget < explosionRadius;
      
      if (targetHitByExplosion && hitType !== "target") {
        hitType = "target";
        toast.success("Alvo Destruído pela Explosão! 💥", {
          description: `Onda de choque nuclear atingiu o alvo!`,
          icon: <Target className="h-5 w-5" />,
        });
      }
      
      // Add explosion
      explosionsRef.current.push({ x, y, frame: 0, maxFrames: 60 });
      
      // Store trajectory for display
      setTrajectory(proj.trajectoryPoints);
      setIsAnimating(false);
      
      if (hitType === "target") {
        setHits(prev => prev + 1);
        if (!targetHitByExplosion) {
          toast.success("Alvo Soviético Destruído! 🎯", {
            description: `Explosão nuclear confirmada!`,
            icon: <Target className="h-5 w-5" />,
          });
        }
        
        setTimeout(() => {
          setTrajectory([]);
          generateNewRound(true);
          toast.info("Nova Localização URSS!", {
            description: "Base soviética reposicionada em local distante",
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
    }
  };

  const fireProjectile = async () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setAttempts(prev => prev + 1);
    setTrajectory([]);
    
    // USSR retaliation triggered immediately in "Guerra Total" mode
    const settings = DIFFICULTY_SETTINGS[difficulty];
    if (settings.ussrRetaliates) {
      setTimeout(() => {
        toast.warning("⚠️ Lançamento Detectado!", {
          description: "URSS preparando contra-ataque...",
        });
      }, 1000);
      
      setTimeout(() => {
        ussrRetaliate();
      }, 3000);
    }
    
    // Calculate physics for USA missile
    const angleRad = (angle * Math.PI) / 180;
    const vx = velocity * Math.cos(angleRad);
    const vy = velocity * Math.sin(angleRad);
    
    // Add USA projectile to the array
    const usaProjectile = {
      id: `usa-${Date.now()}`,
      startX: cannonPos.x,
      startY: cannonPos.y,
      x: cannonPos.x,
      y: cannonPos.y,
      vx,
      vy,
      t: 0,
      isUSSR: false,
      trajectoryPoints: [{ x: cannonPos.x, y: cannonPos.y, isUSSR: false }],
      active: true,
    };
    
    projectilesRef.current.push(usaProjectile);
    
    // Start the game loop if not already running
    if (!animationRef.current) {
      animationRef.current = requestAnimationFrame(runGameLoop);
    }
  };

  const drawMushroomCloud = (ctx, x, y, frame, maxFrames) => {
    const progress = frame / maxFrames;
    const baseSize = 35; // Adjusted from 25 to 35 for better visibility
    const size = baseSize * (1 + progress * 1.5);
    const centerY = CANVAS_HEIGHT - y - 30;
    
    // Initial flash (first 5 frames)
    if (frame < 5) {
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - frame / 5})`;
      ctx.beginPath();
      ctx.arc(x, centerY, size * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Central fireball
    if (progress < 0.8) {
      const fireballRadius = size * (1.2 - progress * 0.3);
      const fireGradient = ctx.createRadialGradient(x, centerY, 0, x, centerY, fireballRadius);
      fireGradient.addColorStop(0, `rgba(255, 255, 220, ${0.9 - progress * 0.7})`);
      fireGradient.addColorStop(0.4, `rgba(255, 180, 50, ${0.8 - progress * 0.6})`);
      fireGradient.addColorStop(0.7, `rgba(255, 80, 0, ${0.7 - progress * 0.5})`);
      fireGradient.addColorStop(1, `rgba(150, 30, 0, ${0.5 - progress * 0.4})`);
      
      ctx.fillStyle = fireGradient;
      ctx.beginPath();
      ctx.arc(x, centerY, fireballRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Mushroom stem (starts at progress 0.25)
    if (progress > 0.25) {
      const stemProgress = (progress - 0.25) / 0.75;
      const stemHeight = size * 2.5 * stemProgress;
      const stemTop = centerY - stemHeight;
      const stemWidthBottom = size * 0.5;
      const stemWidthTop = size * 0.35;
      
      // Stem gradient (darker brown/gray)
      const stemGradient = ctx.createLinearGradient(x, centerY, x, stemTop);
      stemGradient.addColorStop(0, `rgba(100, 50, 30, ${0.9 - progress * 0.4})`);
      stemGradient.addColorStop(0.5, `rgba(80, 40, 25, ${0.85 - progress * 0.4})`);
      stemGradient.addColorStop(1, `rgba(60, 30, 20, ${0.8 - progress * 0.4})`);
      
      ctx.fillStyle = stemGradient;
      ctx.beginPath();
      ctx.moveTo(x - stemWidthBottom, centerY);
      ctx.lineTo(x - stemWidthTop, stemTop);
      ctx.lineTo(x + stemWidthTop, stemTop);
      ctx.lineTo(x + stemWidthBottom, centerY);
      ctx.closePath();
      ctx.fill();
      
      // Smoke texture on stem
      ctx.fillStyle = `rgba(50, 50, 50, ${0.4 - progress * 0.3})`;
      for (let i = 0; i < 3; i++) {
        const smokeY = centerY - stemHeight * (0.3 + i * 0.3);
        ctx.beginPath();
        ctx.ellipse(x, smokeY, stemWidthTop * 0.8, stemWidthTop * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Mushroom cap (starts at progress 0.4)
    if (progress > 0.4) {
      const capProgress = (progress - 0.4) / 0.6;
      const stemHeight = size * 2.5 * ((progress - 0.25) / 0.75);
      const capCenterY = centerY - stemHeight;
      const capRadius = size * 1.3 * capProgress;
      
      // Cap main body (brownish cloud)
      const capGradient = ctx.createRadialGradient(x, capCenterY, 0, x, capCenterY, capRadius);
      capGradient.addColorStop(0, `rgba(120, 80, 60, ${0.9 - progress * 0.5})`);
      capGradient.addColorStop(0.5, `rgba(100, 60, 40, ${0.85 - progress * 0.45})`);
      capGradient.addColorStop(1, `rgba(70, 50, 35, ${0.6 - progress * 0.3})`);
      
      ctx.fillStyle = capGradient;
      ctx.beginPath();
      ctx.ellipse(x, capCenterY, capRadius, capRadius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Cap underside (darker, concave appearance)
      ctx.fillStyle = `rgba(60, 40, 30, ${0.7 - progress * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x, capCenterY + capRadius * 0.3, capRadius * 0.9, capRadius * 0.35, 0, 0, Math.PI);
      ctx.fill();
      
      // Smoke puffs around the cap edge
      const numPuffs = 8;
      for (let i = 0; i < numPuffs; i++) {
        const angle = (i / numPuffs) * Math.PI * 2;
        const puffDistance = capRadius * 0.85;
        const puffX = x + Math.cos(angle) * puffDistance;
        const puffY = capCenterY + Math.sin(angle) * puffDistance * 0.6;
        const puffSize = capRadius * 0.25;
        
        ctx.fillStyle = `rgba(90, 70, 50, ${0.5 - progress * 0.35})`;
        ctx.beginPath();
        ctx.arc(puffX, puffY, puffSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Top of cap highlights
      ctx.fillStyle = `rgba(140, 100, 70, ${0.6 - progress * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(x, capCenterY - capRadius * 0.3, capRadius * 0.6, capRadius * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Flying debris particles
    const numParticles = 12;
    for (let i = 0; i < numParticles; i++) {
      const angle = (i / numParticles) * Math.PI * 2 + progress * 0.5;
      const particleDistance = size * progress * 3;
      const particleX = x + Math.cos(angle) * particleDistance;
      const particleY = centerY + Math.sin(angle) * particleDistance - progress * 60;
      const particleSize = 2 + Math.random() * 2;
      
      ctx.fillStyle = `rgba(255, ${150 - progress * 100}, 0, ${1 - progress})`;
      ctx.beginPath();
      ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Ground dust/shockwave
    if (progress < 0.5) {
      const shockwaveRadius = size * 4 * (progress / 0.5);
      ctx.strokeStyle = `rgba(150, 120, 80, ${0.6 - progress * 1.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, CANVAS_HEIGHT - 30, shockwaveRadius, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
  };

  const ussrRetaliate = () => {
    setUssrAttempts(prev => prev + 1);
    toast.warning("⚠️ URSS Revidando!", {
      description: "Míssil soviético lançado!",
    });
    
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const willHit = Math.random() < settings.ussrAccuracy;
    
    // Calculate angle and velocity for USSR missile (from right to left)
    const distanceX = targetPos.x - cannonPos.x;
    
    let ussrAngle, ussrVelocity;
    
    if (willHit) {
      const g = 9.8;
      const targetRange = distanceX / SCALE;
      ussrVelocity = 40 + Math.random() * 30;
      
      const sinValue = (g * targetRange) / (ussrVelocity * ussrVelocity);
      
      if (sinValue <= 1 && sinValue >= -1) {
        const angle2theta = Math.asin(sinValue);
        ussrAngle = (angle2theta / 2) * (180 / Math.PI);
        ussrAngle += (Math.random() - 0.5) * 5;
      } else {
        ussrAngle = 40 + Math.random() * 15;
      }
    } else {
      ussrAngle = 20 + Math.random() * 60;
      ussrVelocity = 30 + Math.random() * 50;
      
      if (Math.random() > 0.5) {
        ussrAngle *= 0.7;
      } else {
        ussrVelocity *= 0.8;
      }
    }
    
    // Calculate physics for USSR missile
    const angleRad = (ussrAngle * Math.PI) / 180;
    const vx = -ussrVelocity * Math.cos(angleRad); // Negative because going left
    const vy = ussrVelocity * Math.sin(angleRad);
    
    // Add USSR projectile to the array
    const ussrProjectile = {
      id: `ussr-${Date.now()}`,
      startX: targetPos.x,
      startY: targetPos.y,
      x: targetPos.x,
      y: targetPos.y,
      vx,
      vy,
      t: 0,
      isUSSR: true,
      trajectoryPoints: [{ x: targetPos.x, y: targetPos.y, isUSSR: true }],
      active: true,
    };
    
    projectilesRef.current.push(ussrProjectile);
    
    // Start the game loop if not already running
    if (!animationRef.current) {
      animationRef.current = requestAnimationFrame(runGameLoop);
    }
  };

  const resetGame = () => {
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    // Clear projectiles and explosions
    projectilesRef.current = [];
    explosionsRef.current = [];
    
    setHits(0);
    setAttempts(0);
    setUssrHits(0);
    setUssrAttempts(0);
    setIsAnimating(false);
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
