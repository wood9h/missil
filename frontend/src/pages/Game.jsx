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
    
    // Draw USA missile launch tower (left)
    const cannonScreenX = cannonPos.x;
    const cannonScreenY = CANVAS_HEIGHT - 30;
    
    // Tower base platform
    ctx.fillStyle = "#2C3E50";
    ctx.fillRect(cannonScreenX - 30, cannonScreenY - 10, 60, 10);
    
    // Main tower structure
    ctx.fillStyle = "#34495E";
    ctx.fillRect(cannonScreenX - 15, cannonScreenY - 60, 30, 50);
    
    // Tower details (panels)
    ctx.strokeStyle = "#4A5F7F";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cannonScreenX - 15, cannonScreenY - 15 - i * 12);
      ctx.lineTo(cannonScreenX + 15, cannonScreenY - 15 - i * 12);
      ctx.stroke();
    }
    
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(cannonScreenX - 5, cannonScreenY - 60);
    ctx.lineTo(cannonScreenX - 5, cannonScreenY - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cannonScreenX + 5, cannonScreenY - 60);
    ctx.lineTo(cannonScreenX + 5, cannonScreenY - 10);
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
    
    // Red warning light on antenna
    ctx.fillStyle = "#E74C3C";
    ctx.beginPath();
    ctx.arc(cannonScreenX, cannonScreenY - 80, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // USA Flag colors on tower side
    ctx.fillStyle = "#B22234"; // Red
    ctx.fillRect(cannonScreenX - 18, cannonScreenY - 58, 6, 20);
    
    // White stripes
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cannonScreenX - 18, cannonScreenY - 58 + i * 8, 6, 3);
    }
    
    // Blue canton
    ctx.fillStyle = "#3C3B6E";
    ctx.fillRect(cannonScreenX - 18, cannonScreenY - 58, 6, 10);
    
    // Stars (simplified)
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cannonScreenX - 16 + (i % 2) * 3, cannonScreenY - 55 + Math.floor(i / 2) * 4, 1.5, 1.5);
    }
    
    // Label USA
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("USA", cannonScreenX, cannonScreenY - 85);
    
    // Missile launcher with angle indicator
    const angleRad = (angle * Math.PI) / 180;
    const launcherLength = 40;
    const launcherStartX = cannonScreenX;
    const launcherStartY = cannonScreenY - 35;
    const launcherEndX = launcherStartX + Math.cos(angleRad) * launcherLength;
    const launcherEndY = launcherStartY - Math.sin(angleRad) * launcherLength;
    
    // Launch tube structure (darker base)
    ctx.strokeStyle = "#2C5F8D";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(launcherStartX, launcherStartY);
    ctx.lineTo(launcherEndX, launcherEndY);
    ctx.stroke();
    
    // Launch tube highlights (lighter overlay)
    ctx.strokeStyle = "#4A90E2";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(launcherStartX, launcherStartY);
    ctx.lineTo(launcherEndX, launcherEndY);
    ctx.stroke();
    
    // Missile in launcher (when not firing) - positioned and rotated to match angle
    if (!isAnimating) {
      ctx.save();
      
      // Move to launcher start position
      ctx.translate(launcherStartX, launcherStartY);
      
      // Rotate to match launch angle
      ctx.rotate(angleRad);
      
      // Draw missile pointing in the direction of angle
      const missileLength = 28;
      const missileOffset = 8; // Start position inside tube
      
      // Main missile body with gradient
      const bodyGradient = ctx.createLinearGradient(missileOffset, 0, missileOffset + missileLength, 0);
      bodyGradient.addColorStop(0, "#5BA3E8");
      bodyGradient.addColorStop(0.5, "#FFFFFF");
      bodyGradient.addColorStop(1, "#4A90E2");
      ctx.fillStyle = bodyGradient;
      ctx.fillRect(missileOffset, -4, missileLength - 5, 8);
      
      // Nose cone (pointed forward in direction of angle)
      ctx.fillStyle = "#2C5F8D";
      ctx.beginPath();
      ctx.moveTo(missileOffset + missileLength - 5, -4);
      ctx.lineTo(missileOffset + missileLength + 4, 0);
      ctx.lineTo(missileOffset + missileLength - 5, 4);
      ctx.closePath();
      ctx.fill();
      
      // Nose cone highlight
      ctx.fillStyle = "#3D7AB8";
      ctx.beginPath();
      ctx.moveTo(missileOffset + missileLength - 5, -2);
      ctx.lineTo(missileOffset + missileLength + 4, 0);
      ctx.lineTo(missileOffset + missileLength - 5, 2);
      ctx.closePath();
      ctx.fill();
      
      // Tail fins pointing backward
      ctx.fillStyle = "#4A90E2";
      // Top fin
      ctx.beginPath();
      ctx.moveTo(missileOffset, -4);
      ctx.lineTo(missileOffset - 5, -7);
      ctx.lineTo(missileOffset + 4, -4);
      ctx.closePath();
      ctx.fill();
      
      // Bottom fin
      ctx.beginPath();
      ctx.moveTo(missileOffset, 4);
      ctx.lineTo(missileOffset - 5, 7);
      ctx.lineTo(missileOffset + 4, 4);
      ctx.closePath();
      ctx.fill();
      
      // Mid fins (smaller, side fins)
      ctx.fillStyle = "#5BA3E8";
      ctx.fillRect(missileOffset + 2, -5, 3, 1.5);
      ctx.fillRect(missileOffset + 2, 3.5, 3, 1.5);
      
      // USA markings on missile body
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(missileOffset + 12, -3, 8, 6);
      
      // Red stripe
      ctx.fillStyle = "#E74C3C";
      ctx.fillRect(missileOffset + 14, -2, 4, 4);
      
      // Detail lines on body (panel lines)
      ctx.strokeStyle = "#2C5F8D";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(missileOffset + 8 + i * 5, -4);
        ctx.lineTo(missileOffset + 8 + i * 5, 4);
        ctx.stroke();
      }
      
      // Exhaust nozzle at the back
      ctx.fillStyle = "#1A3A4A";
      ctx.fillRect(missileOffset - 2, -3, 3, 6);
      
      // Nozzle inner glow (darker inside)
      ctx.fillStyle = "#34495E";
      ctx.fillRect(missileOffset - 1, -2, 2, 4);
      
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
    
    // Draw projectile (missile)
    if (projectilePos) {
      // Calculate missile rotation angle based on trajectory direction
      const missiles = trajectoryPath.slice(-2); // Last 2 points
      let missileAngle = 0;
      if (missiles.length >= 2) {
        const dx = missiles[1].x - missiles[0].x;
        const dy = missiles[1].y - missiles[0].y;
        missileAngle = Math.atan2(-dy, dx); // Negative dy because canvas Y is inverted
      }
      
      const missileX = projectilePos.x;
      const missileY = CANVAS_HEIGHT - projectilePos.y - 30;
      
      ctx.save();
      ctx.translate(missileX, missileY);
      ctx.rotate(missileAngle);
      
      // USA Missile body (blue)
      // Main body
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
      
      // Flame trail from exhaust
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
      
      ctx.restore();
      
      // Glow effect
      ctx.fillStyle = "rgba(74, 144, 226, 0.3)";
      ctx.beginPath();
      ctx.arc(missileX, missileY, 12, 0, Math.PI * 2);
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
    
    // USSR retaliation triggered immediately in "Guerra Total" mode
    const settings = DIFFICULTY_SETTINGS[difficulty];
    if (settings.ussrRetaliates) {
      // USSR detects launch and retaliates after short delay (3 seconds)
      setTimeout(() => {
        toast.warning("⚠️ Lançamento Detectado!", {
          description: "URSS preparando contra-ataque...",
        });
      }, 1000);
      
      setTimeout(() => {
        ussrRetaliate();
      }, 3000); // USSR launches 3 seconds after USA launch
    }
    
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
        
        // Continue animation showing the trajectory reaching the impact point
        drawCanvas(ctx, { x, y }, trajectoryPoints);
        setTrajectory(trajectoryPoints);
        setIsAnimating(false);
        
        // Wait a moment to show the complete trajectory before explosion
        setTimeout(() => {
          // Check if explosion radius hits the target (area damage)
          const explosionRadius = 80; // Nuclear explosion damage radius
          const distanceToTarget = Math.sqrt(
            Math.pow(x - (targetPos.x + targetPos.width / 2), 2) + 
            Math.pow(y - targetPos.height / 2, 2)
          );
          
          // If explosion is close enough to target, it's destroyed
          const targetHitByExplosion = distanceToTarget < explosionRadius;
          
          if (targetHitByExplosion && hitType !== "target") {
            // Target destroyed by explosion blast!
            hitType = "target";
            toast.success("Alvo Destruído pela Explosão! 💥", {
              description: `Onda de choque nuclear atingiu o alvo!`,
              icon: <Target className="h-5 w-5" />,
            });
          }
          
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
            if (!targetHitByExplosion) {
              toast.success("Alvo Soviético Destruído! 🎯", {
                description: `Explosão nuclear confirmada!`,
                icon: <Target className="h-5 w-5" />,
              });
            }
            
            setTimeout(() => {
              setTrajectory([]);
              generateNewRound(true); // Pass true to indicate hit
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
        }, 200); // Brief pause to show trajectory
        
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
        
        // Check if explosion radius hits USA base (area damage)
        const explosionRadius = 80;
        const distanceToUSA = Math.sqrt(
          Math.pow(x - cannonPos.x, 2) + 
          Math.pow(y - cannonPos.y, 2)
        );
        
        // If explosion is close enough to USA base, it's destroyed
        const usaHitByExplosion = distanceToUSA < explosionRadius;
        
        if (usaHitByExplosion && ussrHitType !== "usa") {
          // USA destroyed by explosion blast!
          ussrHitType = "usa";
          toast.error("💥 Base Americana Atingida pela Explosão!", {
            description: "Onda de choque nuclear!",
          });
        }
        
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
          if (!usaHitByExplosion) {
            toast.error("💥 Base Americana Atingida!", {
              description: "URSS marcou ponto!",
            });
          }
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
      ussrTrajectoryPoints.forEach(point => point.isUSSR = true); // Mark all points as USSR
      
      // Calculate USSR missile rotation angle
      const missiles = ussrTrajectoryPoints.slice(-2);
      let missileAngle = Math.PI; // Default pointing left
      if (missiles.length >= 2) {
        const dx = missiles[1].x - missiles[0].x;
        const dy = missiles[1].y - missiles[0].y;
        missileAngle = Math.atan2(-dy, dx);
      }
      
      // Draw USSR missile in red
      drawCanvas(ctx, null, []);
      
      const missileX = x;
      const missileY = CANVAS_HEIGHT - y - 30;
      
      ctx.save();
      ctx.translate(missileX, missileY);
      ctx.rotate(missileAngle);
      
      // USSR Missile body (red)
      // Main body
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
      
      // Yellow stripe (USSR style)
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(0, -3, 8, 6);
      
      // Flame trail from exhaust
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
      
      ctx.restore();
      
      // Glow effect
      ctx.fillStyle = "rgba(226, 54, 54, 0.3)";
      ctx.beginPath();
      ctx.arc(missileX, missileY, 12, 0, Math.PI * 2);
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
