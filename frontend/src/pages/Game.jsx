import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Target, Play, RotateCcw, TrendingUp, Volume2, VolumeX } from "lucide-react";
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
const GRAVITY = 9.8;

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
  antimissil: {
    wallMinHeight: 140,
    wallMaxHeight: 260,
    wallMinWidth: 20,
    wallMaxWidth: 40,
    wallMinX: 300,
    wallMaxX: 500,
    targetMinDist: 200,
    targetMaxDist: 320,
    ussrRetaliates: true,
    ussrAccuracy: 0.5,
    interceptMode: true,
    interceptChance: 0.55, // 55% chance USSR tries to intercept vs counter-attack
    interceptRadius: 40, // Distance to count as successful intercept
  },
};

export default function Game() {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  // Audio context ref
  const audioContextRef = useRef(null);

  const [angle, setAngle] = useState(45);
  const [velocity, setVelocity] = useState(30);
  const [difficulty, setDifficulty] = useState("medium");
  const [hits, setHits] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [ussrHits, setUssrHits] = useState(0);
  const [ussrAttempts, setUssrAttempts] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [trajectory, setTrajectory] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [gameWinner, setGameWinner] = useState(null); // null, 'usa', or 'ussr'
  
  const WINNING_SCORE = 5; // Score needed to win in Guerra Total
  
  // Refs for hits to check in callbacks
  const hitsRef = useRef(hits);
  const ussrHitsRef = useRef(ussrHits);
  
  useEffect(() => {
    hitsRef.current = hits;
  }, [hits]);
  
  useEffect(() => {
    ussrHitsRef.current = ussrHits;
  }, [ussrHits]);
  
  // Unified projectile management for simultaneous missile flights
  const projectilesRef = useRef([]); // Array of active projectiles: { id, x, y, vx, vy, t, isUSSR, trajectoryPoints, active }
  const explosionsRef = useRef([]); // Array of active explosions: { x, y, frame, maxFrames }
  
  // Refs to access current values in animation loop
  const angleRef = useRef(angle);
  const velocityRef = useRef(velocity);
  const difficultyRef = useRef(difficulty);
  
  // Keep refs in sync with state
  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);
  
  useEffect(() => {
    velocityRef.current = velocity;
  }, [velocity]);
  
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  const [cannonPos] = useState({ x: 50, y: 30 });
  const [wallPos, setWallPos] = useState({ x: 400, y: 0, width: 20, height: 150 });
  const [targetPos, setTargetPos] = useState({ x: 900, y: 30, width: 60, height: 60 });
  const [lastHitPos, setLastHitPos] = useState(null); // Track last successful hit position
  const [mapImage, setMapImage] = useState(null);
  
  // Refs for positions to access in animation loop
  const targetPosRef = useRef(targetPos);
  const wallPosRef = useRef(wallPos);
  
  useEffect(() => {
    targetPosRef.current = targetPos;
  }, [targetPos]);
  
  useEffect(() => {
    wallPosRef.current = wallPos;
  }, [wallPos]);

  // Initialize Web Audio API context
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  // Synthesize missile launch sound
  const playLaunchSound = (isUSSR = false) => {
    if (isMuted) return;
    
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Main rocket whoosh sound
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(isUSSR ? 150 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(isUSSR ? 400 : 500, now + 0.3);
    oscillator.frequency.exponentialRampToValueAtTime(isUSSR ? 100 : 120, now + 1.5);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(2000, now + 0.2);
    filter.frequency.exponentialRampToValueAtTime(400, now + 1.5);
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.5);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start(now);
    oscillator.stop(now + 1.5);
    
    // Add noise burst for ignition
    const bufferSize = ctx.sampleRate * 0.5;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    
    noiseSource.buffer = noiseBuffer;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1500;
    noiseFilter.Q.value = 0.5;
    
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noiseSource.start(now);
    noiseSource.stop(now + 0.5);
  };

  // Synthesize explosion sound
  const playExplosionSound = () => {
    if (isMuted) return;
    
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Deep boom
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(100, now);
    oscillator.frequency.exponentialRampToValueAtTime(20, now + 0.8);
    
    gainNode.gain.setValueAtTime(0.5, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start(now);
    oscillator.stop(now + 0.8);
    
    // Explosion noise
    const bufferSize = ctx.sampleRate * 1.2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    
    noiseSource.buffer = noiseBuffer;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(3000, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 1.2);
    
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noiseSource.start(now);
    noiseSource.stop(now + 1.2);
  };

  // Play alert siren sound
  const playAlertSound = () => {
    if (isMuted) return;
    
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Siren oscillator
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = 'square';
    
    // Siren pattern
    for (let i = 0; i < 3; i++) {
      const t = i * 0.4;
      oscillator.frequency.setValueAtTime(600, now + t);
      oscillator.frequency.linearRampToValueAtTime(900, now + t + 0.2);
      oscillator.frequency.linearRampToValueAtTime(600, now + t + 0.4);
    }
    
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.setValueAtTime(0.15, now + 1.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start(now);
    oscillator.stop(now + 1.2);
  };

  // Background military march music generator
  const bgMusicNodesRef = useRef({ isPlaying: false, nodes: [] });
  
  const playBackgroundMusic = () => {
    if (isMuted || bgMusicNodesRef.current.isPlaying) return;
    
    const ctx = getAudioContext();
    bgMusicNodesRef.current.isPlaying = true;
    setMusicPlaying(true);
    
    // Create a simple military drum beat pattern
    const playDrumBeat = () => {
      if (!bgMusicNodesRef.current.isPlaying || isMuted) return;
      
      const now = ctx.currentTime;
      const beatDuration = 0.5;
      
      // Bass drum
      const bassDrum = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      };
      
      // Snare drum (noise burst)
      const snareDrum = (time) => {
        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        noise.buffer = buffer;
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
        noise.stop(time + 0.1);
      };
      
      // Beat pattern: BOOM - - SNAP - BOOM - SNAP -
      bassDrum();
      snareDrum(now + beatDuration);
      
      // Schedule next beat
      setTimeout(playDrumBeat, beatDuration * 2 * 1000);
    };
    
    playDrumBeat();
  };

  const stopBackgroundMusic = () => {
    bgMusicNodesRef.current.isPlaying = false;
    setMusicPlaying(false);
  };

  // Toggle background music
  const toggleMusic = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    if (newMuted) {
      stopBackgroundMusic();
    }
  };

  // Start background music on first interaction
  const startBackgroundMusic = () => {
    if (!isMuted && !bgMusicNodesRef.current.isPlaying) {
      playBackgroundMusic();
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBackgroundMusic();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

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
    
    // Force more randomness with timestamp-based seed variation
    const randomSeed = Date.now() % 1000;
    
    let wallX, wallHeight, wallWidth, targetX, targetDist;
    
    // In Guerra Total mode, ensure target is visible on right side but still random
    const isGuerraTotal = settings.ussrRetaliates;
    
    // Generate random values with more variation
    wallHeight = settings.wallMinHeight + (Math.random() * (settings.wallMaxHeight - settings.wallMinHeight));
    wallWidth = settings.wallMinWidth + (Math.random() * (settings.wallMaxWidth - settings.wallMinWidth));
    wallX = settings.wallMinX + (Math.random() * (settings.wallMaxX - settings.wallMinX));
    
    // Add extra randomness based on seed
    wallX += (randomSeed % 100) - 50;
    wallX = Math.max(settings.wallMinX, Math.min(settings.wallMaxX, wallX));
    
    // Random target distance with extra variation
    targetDist = settings.targetMinDist + (Math.random() * (settings.targetMaxDist - settings.targetMinDist));
    targetDist += (randomSeed % 50) - 25;
    
    targetX = wallX + wallWidth + targetDist;
    
    // In Guerra Total, ensure target is within acceptable range but still varies
    if (isGuerraTotal) {
      const minTargetX = 650;
      const maxTargetX = CANVAS_WIDTH - 100;
      
      if (targetX < minTargetX) {
        targetX = minTargetX + (Math.random() * 300); // 650-950
      }
      if (targetX > maxTargetX) {
        targetX = maxTargetX - (Math.random() * 100);
      }
    }
    
    // Ensure target doesn't go off screen
    const maxTargetX = CANVAS_WIDTH - 100;
    if (targetX > maxTargetX) {
      targetX = maxTargetX - (Math.random() * 50);
    }
    
    // If there was a hit, try to move position significantly
    if (wasHit && lastHitPos) {
      // Force a different position by adjusting if too close
      if (Math.abs(targetX - lastHitPos.x) < 100) {
        targetX = lastHitPos.x > (CANVAS_WIDTH / 2) 
          ? lastHitPos.x - 150 - (Math.random() * 100)
          : lastHitPos.x + 150 + (Math.random() * 100);
      }
      if (Math.abs(wallX - lastHitPos.wallX) < 50) {
        wallX = lastHitPos.wallX > (CANVAS_WIDTH / 2) 
          ? lastHitPos.wallX - 80 - (Math.random() * 50)
          : lastHitPos.wallX + 80 + (Math.random() * 50);
      }
    }
    
    // Clamp values to valid ranges
    wallX = Math.max(200, Math.min(600, wallX));
    targetX = Math.max(wallX + wallWidth + 100, Math.min(CANVAS_WIDTH - 80, targetX));
    
    // Random target size for more variation
    const targetWidth = 50 + (Math.random() * 30);
    const targetHeight = 50 + (Math.random() * 30);
    
    setWallPos({ x: wallX, y: 0, width: wallWidth, height: wallHeight });
    setTargetPos({ 
      x: targetX, 
      y: 30, 
      width: targetWidth, 
      height: targetHeight 
    });
    
    // Store position for next round comparison only when there was a hit
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
    // Get current positions from refs (for animation loop access)
    const currentWallPos = wallPosRef.current;
    const currentTargetPos = targetPosRef.current;
    
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
    // Check if USA has any active projectiles
    const usaHasActiveMissile = activeProjectiles.some(p => !p.isUSSR && p.active);
    
    if (!usaHasActiveMissile) {
      // Use angleRef to get current angle value in animation loop
      const currentAngle = angleRef.current;
      const angleRad = (currentAngle * Math.PI) / 180;
      const launchPointY = cannonScreenY - 32;
      
      ctx.save();
      ctx.translate(cannonScreenX, launchPointY);
      // Rotate so 0° is horizontal (pointing right) and 90° is vertical (pointing up)
      // In canvas, negative rotation goes counter-clockwise, so we use -angleRad
      ctx.rotate(-angleRad);
      
      // Draw the missile pointing in the direction of launch
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
      
      // Draw aim line to show launch angle more clearly
      ctx.save();
      ctx.strokeStyle = "rgba(74, 144, 226, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(cannonScreenX, launchPointY);
      const aimLength = 80;
      const aimEndX = cannonScreenX + Math.cos(angleRad) * aimLength;
      const aimEndY = launchPointY - Math.sin(angleRad) * aimLength;
      ctx.lineTo(aimEndX, aimEndY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    
    // Draw obstacle (mountain range / geographic barrier)
    ctx.fillStyle = "#5D4E37"; // Brown mountains
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillRect(currentWallPos.x, CANVAS_HEIGHT - currentWallPos.height - 30, currentWallPos.width, currentWallPos.height);
    ctx.shadowBlur = 0;
    
    // Mountain peaks effect
    ctx.fillStyle = "#8B7355";
    ctx.beginPath();
    for (let i = 0; i < currentWallPos.width; i += 8) {
      ctx.moveTo(currentWallPos.x + i, CANVAS_HEIGHT - 30);
      ctx.lineTo(currentWallPos.x + i + 4, CANVAS_HEIGHT - currentWallPos.height - 30 - 10);
      ctx.lineTo(currentWallPos.x + i + 8, CANVAS_HEIGHT - 30);
    }
    ctx.fill();
    
    // Snow caps
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(currentWallPos.x + (currentWallPos.width / 4) * i, CANVAS_HEIGHT - currentWallPos.height - 30, currentWallPos.width / 4, 5);
    }
    
    // Draw USSR target/base (right - União Soviética)
    const targetScreenX = currentTargetPos.x;
    const targetScreenY = CANVAS_HEIGHT - 30 - currentTargetPos.height;
    
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const isGuerraTotal = settings.ussrRetaliates;
    
    if (isGuerraTotal) {
      // USSR Missile Launch Tower (Guerra Total mode)
      const towerCenterX = targetScreenX + currentTargetPos.width / 2;
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
      ctx.fillRect(targetScreenX, targetScreenY + 20, currentTargetPos.width, currentTargetPos.height - 20);
      
      // Roof
      ctx.fillStyle = "#A52A2A";
      ctx.beginPath();
      ctx.moveTo(targetScreenX - 5, targetScreenY + 20);
      ctx.lineTo(targetScreenX + currentTargetPos.width / 2, targetScreenY);
      ctx.lineTo(targetScreenX + currentTargetPos.width + 5, targetScreenY + 20);
      ctx.closePath();
      ctx.fill();
      
      // Soviet flag on top
      ctx.fillStyle = "#CC0000"; // Bright red
      ctx.fillRect(targetScreenX + currentTargetPos.width / 2 - 2, targetScreenY - 15, 2, 15);
      ctx.fillRect(targetScreenX + currentTargetPos.width / 2, targetScreenY - 15, 20, 12);
      
      // Hammer and Sickle (simplified)
      ctx.fillStyle = "#FFD700"; // Gold
      ctx.font = "bold 10px Arial";
      ctx.fillText("☭", targetScreenX + currentTargetPos.width / 2 + 7, targetScreenY - 5);
      
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
      ctx.fillText("СССР", targetScreenX + currentTargetPos.width / 2, targetScreenY - 20);
      
      // Antenna/tower
      ctx.strokeStyle = "#8B0000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(targetScreenX + currentTargetPos.width - 5, targetScreenY + 20);
      ctx.lineTo(targetScreenX + currentTargetPos.width - 5, targetScreenY - 5);
      ctx.stroke();
    }
    
    // USSR Missile on launch platform in Guerra Total mode (drawn last so it's on top)
    if (isGuerraTotal) {
      const towerCenterX = targetScreenX + currentTargetPos.width / 2;
      const towerBaseY = CANVAS_HEIGHT - 30;
      const ussrHasActiveMissile = activeProjectiles.some(p => p.isUSSR && p.active);
      
      if (!ussrHasActiveMissile) {
        ctx.save();
        // Position missile to the left of the tower, pointing up-left
        ctx.translate(towerCenterX - 25, towerBaseY - 50);
        // USSR missile points LEFT and UP (45° angle pointing up-left)
        ctx.rotate(-Math.PI * 3 / 4); // -135 degrees
        
        const ussrMissileLength = 35;
        const ussrMissileStart = 0;
        
        // USSR Missile body (red)
        ctx.fillStyle = "#E23636";
        ctx.fillRect(ussrMissileStart, -4, ussrMissileLength - 6, 8);
        
        // Nose cone
        ctx.fillStyle = "#B22222";
        ctx.beginPath();
        ctx.moveTo(ussrMissileStart + ussrMissileLength - 6, -4);
        ctx.lineTo(ussrMissileStart + ussrMissileLength + 4, 0);
        ctx.lineTo(ussrMissileStart + ussrMissileLength - 6, 4);
        ctx.closePath();
        ctx.fill();
        
        // Tail fins
        ctx.fillStyle = "#FF4444";
        ctx.beginPath();
        ctx.moveTo(ussrMissileStart, -4);
        ctx.lineTo(ussrMissileStart - 5, -8);
        ctx.lineTo(ussrMissileStart + 4, -4);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(ussrMissileStart, 4);
        ctx.lineTo(ussrMissileStart - 5, 8);
        ctx.lineTo(ussrMissileStart + 4, 4);
        ctx.closePath();
        ctx.fill();
        
        // Yellow stripe (USSR style)
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(ussrMissileStart + 14, -3, 8, 6);
        
        // Exhaust nozzle
        ctx.fillStyle = "#333";
        ctx.fillRect(ussrMissileStart - 2, -3, 3, 6);
        
        ctx.restore();
      }
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

  // Animation loop effect - runs continuously when there are active projectiles
  useEffect(() => {
    let frameId = null;
    
    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      
      const ctx = canvas.getContext("2d");
      const dt = 0.016;
      
      let hasActiveProjectiles = false;
      
      // Update all projectiles
      projectilesRef.current.forEach(proj => {
        if (!proj.active) return;
        hasActiveProjectiles = true;
        
        proj.t += dt;
        
        // Calculate new position
        proj.x = proj.startX + proj.vx * SCALE * proj.t;
        proj.y = proj.startY + proj.vy * SCALE * proj.t - 0.5 * GRAVITY * SCALE * proj.t * proj.t;
        
        proj.trajectoryPoints.push({ x: proj.x, y: proj.y, isUSSR: proj.isUSSR });
        
        // Check collision
        let collision = null;
        
        if (proj.isUSSR) {
          // USSR missile collisions
          if (proj.y <= 0) collision = { type: "ground" };
          else if (proj.x >= wallPosRef.current.x && proj.x <= wallPosRef.current.x + wallPosRef.current.width && proj.y <= wallPosRef.current.height) {
            collision = { type: "wall" };
          } else if (proj.x >= cannonPos.x - 30 && proj.x <= cannonPos.x + 30 && proj.y >= 0 && proj.y <= 50) {
            collision = { type: "usa" };
          }
        } else {
          // USA missile collisions
          if (proj.y <= 0) collision = { type: "ground" };
          else if (proj.x >= wallPosRef.current.x && proj.x <= wallPosRef.current.x + wallPosRef.current.width && proj.y <= wallPosRef.current.height) {
            collision = { type: "wall" };
          } else if (proj.x >= targetPosRef.current.x && proj.x <= targetPosRef.current.x + targetPosRef.current.width && proj.y >= 0 && proj.y <= targetPosRef.current.height) {
            collision = { type: "target" };
          }
        }
        
        // Check out of bounds or timeout
        if (collision || proj.t >= 10 || (proj.isUSSR && proj.x < -50) || (!proj.isUSSR && proj.x > CANVAS_WIDTH + 50)) {
          proj.active = false;
          
          if (collision) {
            handleProjectileImpactInternal(proj, collision);
          } else {
            if (proj.isUSSR) {
              toast.info("Míssil soviético perdido");
            } else {
              toast.info("Projétil perdido", { description: "Fora do alcance" });
              setIsAnimating(false);
            }
          }
        }
      });
      
      // Missile-to-missile collision detection (Antimissil mode)
      const activeProjs = projectilesRef.current.filter(p => p.active);
      const usaMissiles = activeProjs.filter(p => !p.isUSSR);
      const ussrMissiles = activeProjs.filter(p => p.isUSSR && p.isInterceptor);
      
      for (const usaM of usaMissiles) {
        for (const ussrM of ussrMissiles) {
          const dx = usaM.x - ussrM.x;
          const dy = usaM.y - ussrM.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const interceptRadius = DIFFICULTY_SETTINGS[difficultyRef.current]?.interceptRadius || 40;
          
          if (dist < interceptRadius) {
            // Both missiles destroyed mid-air!
            usaM.active = false;
            ussrM.active = false;
            
            // Explosion at midpoint
            const midX = (usaM.x + ussrM.x) / 2;
            const midY = (usaM.y + ussrM.y) / 2;
            explosionsRef.current.push({ x: midX, y: midY, frame: 0, maxFrames: 50 });
            
            playExplosionSound();
            
            // USSR successfully intercepted
            setUssrHits(prev => {
              const newScore = prev + 1;
              if (newScore >= WINNING_SCORE && difficultyRef.current === "antimissil") {
                setTimeout(() => {
                  setGameWinner('ussr');
                  stopBackgroundMusic();
                  toast.error("☭ VITÓRIA DA URSS! ☭", {
                    description: `A URSS venceu com ${newScore} interceptações/acertos!`,
                    duration: 10000,
                  });
                }, 1000);
              }
              return newScore;
            });
            
            toast.warning("💥 INTERCEPTAÇÃO! Míssil destruído no ar!", {
              description: "A URSS interceptou o míssil americano!",
            });
            
            setIsAnimating(false);
            
            // Store trajectories
            setTrajectory(prev => [
              ...usaM.trajectoryPoints,
              ...ussrM.trajectoryPoints.map(p => ({ ...p, isUSSR: true })),
            ]);
            
            // Generate new round if game not won
            const currentUssrHits = ussrHitsRef.current;
            if (currentUssrHits + 1 < WINNING_SCORE || difficultyRef.current !== "antimissil") {
              setTimeout(() => {
                setTrajectory([]);
                generateNewRound(false);
              }, 3000);
            }
          }
        }
      }
      
      // Update explosions
      explosionsRef.current = explosionsRef.current.filter(exp => {
        exp.frame++;
        return exp.frame < exp.maxFrames;
      });
      
      // Draw everything
      drawCanvas(ctx, projectilesRef.current, explosionsRef.current);
      
      // Check again for active projectiles (might have been added during collision handling)
      const stillHasActive = projectilesRef.current.some(p => p.active);
      
      // Continue loop if there are active projectiles or explosions
      if (stillHasActive || explosionsRef.current.length > 0) {
        frameId = requestAnimationFrame(animate);
      } else {
        // Clean up finished projectiles
        projectilesRef.current = projectilesRef.current.filter(p => p.active);
        frameId = requestAnimationFrame(animate); // Keep checking for new projectiles
      }
    };
    
    // Start the animation loop
    frameId = requestAnimationFrame(animate);
    
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Internal impact handler to avoid closure issues
  const handleProjectileImpactInternal = (proj, collision) => {
    const { x, y, isUSSR } = proj;
    let hitType = collision.type;
    
    // Play explosion sound
    playExplosionSound();
    
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
        setUssrHits(prev => {
          const newScore = prev + 1;
          // Check for USSR victory - use ref for current difficulty
          if (newScore >= WINNING_SCORE && (difficultyRef.current === "total" || difficultyRef.current === "antimissil")) {
                duration: 10000,
              });
            }, 1000);
          }
          return newScore;
        });
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
      const target = targetPosRef.current;
      const distanceToTarget = Math.sqrt(
        Math.pow(x - (target.x + target.width / 2), 2) + 
        Math.pow(y - target.height / 2, 2)
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
        setHits(prev => {
          const newScore = prev + 1;
          // Check for USA victory - use ref for current difficulty
          if (newScore >= WINNING_SCORE && difficultyRef.current === "total") {
            setTimeout(() => {
              setGameWinner('usa');
              stopBackgroundMusic();
              toast.success("🇺🇸 VITÓRIA DOS ESTADOS UNIDOS! 🇺🇸", {
                description: `Os EUA venceram a Guerra Fria com ${newScore} acertos!`,
                duration: 10000,
              });
            }, 1000);
          }
          return newScore;
        });
        if (!targetHitByExplosion) {
          toast.success("Alvo Soviético Destruído! 🎯", {
            description: `Explosão nuclear confirmada!`,
            icon: <Target className="h-5 w-5" />,
          });
        }
        
        // Only generate new round if game not won - use ref for current values
        const currentHits = hitsRef.current;
        if (currentHits + 1 < WINNING_SCORE || difficultyRef.current !== "total") {
          setTimeout(() => {
            setTrajectory([]);
            generateNewRound(true);
            toast.info("Nova Localização URSS!", {
              description: "Base soviética reposicionada em local distante",
            });
          }, 3000);
        }
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
    if (isAnimating || gameWinner) return; // Block firing if game is won
    
    // Start background music on first interaction
    startBackgroundMusic();
    
    // Play USA launch sound
    playLaunchSound(false);
    
    setIsAnimating(true);
    setAttempts(prev => prev + 1);
    setTrajectory([]);
    
    // USSR retaliation triggered immediately in "Guerra Total" or "Defesa Antimíssil" mode
    const settings = DIFFICULTY_SETTINGS[difficulty];
    if (settings.ussrRetaliates) {
      const isInterceptMode = settings.interceptMode;
      setTimeout(() => {
        playAlertSound();
        toast.warning(isInterceptMode ? "⚠️ Lançamento Detectado!" : "⚠️ Lançamento Detectado!", {
          description: isInterceptMode
            ? "URSS avaliando resposta..."
            : "URSS preparando contra-ataque...",
        });
      }, 1000);
      
      setTimeout(() => {
        if (isInterceptMode) {
          ussrDecideResponse();
        } else {
          ussrRetaliate();
        }
      }, 3000);
    }
    
    // Calculate physics for USA missile
    const angleRad = (angle * Math.PI) / 180;
    const vx = velocity * Math.cos(angleRad);
    const vy = velocity * Math.sin(angleRad);
    
    // Add USA projectile to the array (the animation loop will pick it up)
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
    
    // Play USSR launch sound
    playLaunchSound(true);
    
    toast.warning("⚠️ URSS Revidando!", {
      description: "Míssil soviético lançado!",
    });
    
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const willHit = Math.random() < settings.ussrAccuracy;
    
    // Get current target position from ref
    const currentTargetPos = targetPosRef.current;
    
    // Calculate launch position - from the USSR tower in Guerra Total mode
    // The tower is centered at currentTargetPos.x + currentTargetPos.width / 2
    const launchX = currentTargetPos.x + currentTargetPos.width / 2;
    const launchY = 50; // Launch from top of tower (higher than ground level 30)
    
    // Calculate angle and velocity for USSR missile (from right to left)
    const distanceX = launchX - cannonPos.x;
    
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
    
    // Add USSR projectile to the array (the animation loop will pick it up)
    const ussrProjectile = {
      id: `ussr-${Date.now()}`,
      startX: launchX,
      startY: launchY,
      x: launchX,
      y: launchY,
      vx,
      vy,
      t: 0,
      isUSSR: true,
      trajectoryPoints: [{ x: launchX, y: launchY, isUSSR: true }],
      active: true,
    };
    
    projectilesRef.current.push(ussrProjectile);
  };

  // Antimissil mode: USSR decides to intercept or counter-attack
  const ussrDecideResponse = () => {
    const settings = DIFFICULTY_SETTINGS[difficultyRef.current];
    const willIntercept = Math.random() < (settings.interceptChance || 0.55);
    
    if (willIntercept) {
      ussrIntercept();
    } else {
      // Counter-attack like normal
      ussrRetaliate();
    }
  };

  // USSR fires an interceptor missile aimed at the incoming US missile
  const ussrIntercept = () => {
    setUssrAttempts(prev => prev + 1);
    
    playLaunchSound(true);
    
    toast.error("🛡 URSS Interceptando!", {
      description: "Míssil antimíssil lançado!",
    });
    
    const currentTargetPos = targetPosRef.current;
    
    // Launch from USSR tower
    const launchX = currentTargetPos.x + currentTargetPos.width / 2;
    const launchY = 50;
    
    // Find the active USA missile to intercept
    const usaMissile = projectilesRef.current.find(p => !p.isUSSR && p.active);
    
    if (!usaMissile) {
      toast.info("Nenhum míssil para interceptar");
      return;
    }
    
    // Predict where the US missile will be in ~1-2 seconds
    const predictTime = 1.0 + Math.random() * 1.0;
    const predictedX = usaMissile.startX + usaMissile.vx * SCALE * (usaMissile.t + predictTime);
    const predictedY = usaMissile.startY + usaMissile.vy * SCALE * (usaMissile.t + predictTime) 
                       - 0.5 * GRAVITY * SCALE * (usaMissile.t + predictTime) * (usaMissile.t + predictTime);
    
    // Calculate intercept trajectory
    const dx = launchX - predictedX;
    const dy = predictedY - launchY;
    const distToIntercept = Math.sqrt(dx * dx + dy * dy);
    
    // Add some inaccuracy (30% miss chance)
    const accuracyJitter = (Math.random() - 0.5) * 0.3;
    
    const interceptAngle = Math.atan2(dy, dx) + accuracyJitter;
    const interceptVelocity = distToIntercept / (predictTime * SCALE) * 1.2;
    
    const clampedVelocity = Math.max(25, Math.min(70, interceptVelocity));
    
    const vx = -clampedVelocity * Math.cos(interceptAngle);
    const vy = clampedVelocity * Math.sin(interceptAngle);
    
    const ussrProjectile = {
      id: `ussr-intercept-${Date.now()}`,
      startX: launchX,
      startY: launchY,
      x: launchX,
      y: launchY,
      vx,
      vy,
      t: 0,
      isUSSR: true,
      isInterceptor: true,
      trajectoryPoints: [{ x: launchX, y: launchY, isUSSR: true }],
      active: true,
    };
    
    projectilesRef.current.push(ussrProjectile);
  };


  const resetGame = () => {
    // Clear projectiles and explosions
    projectilesRef.current = [];
    explosionsRef.current = [];
    
    setHits(0);
    setAttempts(0);
    setUssrHits(0);
    setUssrAttempts(0);
    setIsAnimating(false);
    setTrajectory([]);
    setLastHitPos(null); // Reset last hit position to allow fresh random positions
    setGameWinner(null); // Reset winner
    stopBackgroundMusic();
    generateNewRound();
    toast.info("Missão reiniciada!");
  };

  const accuracy = attempts > 0 ? ((hits / attempts) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-4 md:p-6 flex flex-col">
      {/* Header - Centered */}
      <header className="mb-4 flex flex-col items-center text-center">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Guerra Fria: Cálculo Balístico
          </h1>
          {/* Sound Toggle Button */}
          <Button
            onClick={toggleMusic}
            variant={isMuted ? "outline" : "default"}
            size="sm"
            className={`${isMuted ? 'border-slate-500 text-slate-400 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white'} transition-all`}
            data-testid="sound-toggle"
          >
            {isMuted ? <VolumeX className="h-4 w-4 mr-1" /> : <Volume2 className="h-4 w-4 mr-1" />}
            {isMuted ? "Som OFF" : "Som ON"}
          </Button>
        </div>
        <p className="text-sm text-slate-400">USA 🇺🇸 vs URSS 🚩 | Simulador de Mísseis Intercontinentais</p>
        
        {/* Score Display - Centered */}
        <div className="flex items-center gap-4 mt-4">
          {difficulty === "total" ? (
            <>
              <div className={`rounded-xl px-6 py-3 shadow-lg border-2 transition-all ${gameWinner === 'usa' ? 'bg-emerald-600 border-emerald-400 scale-110' : 'bg-blue-600 border-blue-500'}`}>
                <div className="text-xs uppercase tracking-wider text-blue-200 mb-1">🇺🇸 USA</div>
                <div className="text-3xl font-bold text-white font-mono">{hits}</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-3xl font-bold text-slate-400">VS</div>
                <div className="text-xs text-slate-500">Primeiro a {WINNING_SCORE}</div>
              </div>
              <div className={`rounded-xl px-6 py-3 shadow-lg border-2 transition-all ${gameWinner === 'ussr' ? 'bg-emerald-600 border-emerald-400 scale-110' : 'bg-red-600 border-red-500'}`}>
                <div className="text-xs uppercase tracking-wider text-red-200 mb-1">🚩 CCCP</div>
                <div className="text-3xl font-bold text-white font-mono">{ussrHits}</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-700 rounded-xl px-6 py-3 shadow-lg border border-slate-600">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Taxa de Acerto</div>
                <div className="text-2xl font-bold text-emerald-400 font-mono">{accuracy}%</div>
              </div>
              <div className="bg-slate-700 rounded-xl px-6 py-3 shadow-lg border border-slate-600">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Alvos Atingidos</div>
                <div className="text-2xl font-bold text-amber-400 font-mono">{hits}/{attempts}</div>
              </div>
            </>
          )}
        </div>
        
        {/* Victory Banner */}
        {gameWinner && (
          <div className={`mt-4 px-8 py-4 rounded-xl ${gameWinner === 'usa' ? 'bg-blue-600' : 'bg-red-600'} animate-pulse`}>
            <div className="text-2xl font-bold text-white text-center">
              {gameWinner === 'usa' ? '🇺🇸 VITÓRIA DOS EUA! 🇺🇸' : '☭ VITÓRIA DA URSS! ☭'}
            </div>
            <div className="text-sm text-white/80 text-center mt-1">
              Clique em "Reiniciar Missão" para jogar novamente
            </div>
          </div>
        )}
      </header>

      {/* Main Content - Centered */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-center justify-center max-w-7xl mx-auto w-full">
        {/* Canvas Area - Centered */}
        <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-4 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="rounded-lg border border-slate-600 max-w-full h-auto"
            style={{ maxHeight: 'calc(100vh - 350px)' }}
            data-testid="game-canvas"
          />
        </div>

        {/* Controls Panel - Compact and Centered */}
        <div className="w-full lg:w-80 bg-slate-800/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700 p-5 flex flex-col gap-4">
          {/* Difficulty Selector */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2 block">
              Dificuldade
            </label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-full bg-slate-700 border-slate-600 text-white" data-testid="difficulty-select">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                <SelectItem value="easy" className="text-white hover:bg-slate-600">Fácil</SelectItem>
                <SelectItem value="medium" className="text-white hover:bg-slate-600">Médio</SelectItem>
                <SelectItem value="hard" className="text-white hover:bg-slate-600">Difícil</SelectItem>
                <SelectItem value="total" className="text-white hover:bg-slate-600">Guerra Total 🔥</SelectItem>
                <SelectItem value="antimissil" className="text-white hover:bg-slate-600">Defesa Antimíssil 🛡</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Angle Control */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2 block">
              Ângulo de Lançamento
            </label>
            <div className="flex items-center gap-3">
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
              <div className="text-xl font-mono font-bold text-emerald-400 w-14 text-right">
                {angle}°
              </div>
            </div>
          </div>

          {/* Velocity Control */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2 block">
              Velocidade <span className="text-slate-500">(m/s)</span>
            </label>
            <div className="flex items-center gap-3">
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
              <div className="text-xl font-mono font-bold text-emerald-400 w-14 text-right">
                {velocity}
              </div>
            </div>
          </div>

          {/* Fire Button */}
          <Button
            onClick={fireProjectile}
            disabled={isAnimating}
            className="w-full bg-red-600 hover:bg-red-500 text-white py-5 text-lg font-bold rounded-xl shadow-lg hover:shadow-red-500/30 transition-all active:scale-95 disabled:opacity-50"
            data-testid="fire-button"
          >
            <Play className="mr-2 h-5 w-5" />
            {isAnimating ? "Míssil em voo..." : "Lançar Míssil"}
          </Button>

          {/* Reset Button */}
          <Button
            onClick={resetGame}
            variant="outline"
            className="w-full border-2 border-slate-600 hover:bg-slate-700 text-slate-300 py-3 rounded-xl"
            data-testid="reset-button"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar Missão
          </Button>

          {/* Stats Card */}
          <div className="pt-3 border-t border-slate-700">
            <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                  {difficulty === "total" ? "Placar da Guerra" : "Relatório de Missão"}
                </span>
              </div>
              {difficulty === "total" ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-blue-900/50 p-2 rounded border border-blue-800">
                    <div className="font-bold text-blue-300 mb-1">🇺🇸 EUA</div>
                    <div className="text-slate-300">Acertos: <span className="font-bold text-white">{hits}</span></div>
                    <div className="text-slate-300">Disparos: <span className="font-bold text-white">{attempts}</span></div>
                  </div>
                  <div className="bg-red-900/50 p-2 rounded border border-red-800">
                    <div className="font-bold text-red-300 mb-1">🚩 URSS</div>
                    <div className="text-slate-300">Acertos: <span className="font-bold text-white">{ussrHits}</span></div>
                    <div className="text-slate-300">Disparos: <span className="font-bold text-white">{ussrAttempts}</span></div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Lançamentos:</span>
                    <span className="font-bold text-white">{attempts}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Alvos Destruídos:</span>
                    <span className="font-bold text-emerald-400">{hits}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Falhas:</span>
                    <span className="font-bold text-red-400">{attempts - hits}</span>
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
