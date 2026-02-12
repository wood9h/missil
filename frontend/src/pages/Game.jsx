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
  const [isAnimating, setIsAnimating] = useState(false);
  const [trajectory, setTrajectory] = useState([]);

  const [cannonPos] = useState({ x: 50, y: 30 });
  const [wallPos, setWallPos] = useState({ x: 400, y: 0, width: 20, height: 150 });
  const [targetPos, setTargetPos] = useState({ x: 900, y: 30, width: 60, height: 60 });

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
    
    // Sky gradient (Cold War atmosphere)
    const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGradient.addColorStop(0, "#1e3a5f");
    skyGradient.addColorStop(0.7, "#2a5a8a");
    skyGradient.addColorStop(1, "#3d7ab8");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // World map simplified continents
    ctx.fillStyle = "#4a5f3a"; // Dark green for land
    ctx.globalAlpha = 0.4;
    
    // Americas (left side)
    ctx.fillRect(50, 200, 80, 200);
    ctx.fillRect(70, 350, 60, 150);
    
    // Europe/Asia (middle to right)
    ctx.fillRect(400, 150, 200, 180);
    ctx.fillRect(550, 200, 350, 200);
    ctx.fillRect(750, 350, 150, 120);
    
    // Africa (middle-left)
    ctx.fillRect(380, 320, 120, 180);
    
    ctx.globalAlpha = 1.0;
    
    // Ocean effect
    ctx.strokeStyle = "rgba(100, 150, 200, 0.3)";
    ctx.lineWidth = 2;
    for (let y = 100; y < CANVAS_HEIGHT - 30; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    
    // Ground line (Earth surface)
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT - 30);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 30);
    ctx.stroke();
    
    // Draw trajectory path (missile trail)
    if (trajectoryPath.length > 0) {
      ctx.strokeStyle = "#FF6B6B";
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
  }, [angle, velocity, wallPos, targetPos, trajectory]);

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
        
        if (hitType === "target") {
          setHits(prev => prev + 1);
          toast.success("Alvo Soviético Destruído! 🎯", {
            description: `Novo desafio em 2 segundos...`,
            icon: <Target className="h-5 w-5" />,
          });
          setTimeout(() => {
            setTrajectory([]);
            generateNewRound();
            toast.info("Nova Localização URSS!", {
              description: "Base soviética reposicionada",
            });
          }, 2000);
        } else if (hitType === "wall") {
          toast.error("Bloqueado por obstáculo geográfico!", {
            description: "Ajuste o ângulo ou velocidade do míssil",
          });
        } else {
          toast.info("Míssil perdido", {
            description: "Não atingiu o território soviético",
          });
        }
        
        setIsAnimating(false);
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

  const resetGame = () => {
    setHits(0);
    setAttempts(0);
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
          <div className="bg-white rounded-xl px-6 py-3 shadow-sm border border-slate-200">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Taxa de Acerto</div>
            <div className="text-2xl font-bold text-indigo-600 font-mono">{accuracy}%</div>
          </div>
          <div className="bg-white rounded-xl px-6 py-3 shadow-sm border border-slate-200">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Alvos Atingidos</div>
            <div className="text-2xl font-bold text-green-600 font-mono">{hits}/{attempts}</div>
          </div>
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
              Velocidade
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
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 text-lg font-bold rounded-full shadow-lg hover:shadow-xl transition-all active:scale-95"
            data-testid="fire-button"
          >
            <Play className="mr-2 h-5 w-5" />
            {isAnimating ? "Disparando..." : "Disparar"}
          </Button>

          {/* Reset Button */}
          <Button
            onClick={resetGame}
            variant="outline"
            className="w-full border-2 border-slate-200 hover:bg-slate-50 py-3 rounded-xl"
            data-testid="reset-button"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar
          </Button>

          {/* Stats Card */}
          <div className="pt-4 border-t border-slate-200">
            <div className="bg-gradient-to-br from-indigo-50 to-rose-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
                <span className="text-xs uppercase tracking-wider text-slate-600 font-medium">
                  Estatísticas
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Tentativas:</span>
                  <span className="font-bold text-slate-900">{attempts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Acertos:</span>
                  <span className="font-bold text-green-600">{hits}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Erros:</span>
                  <span className="font-bold text-rose-600">{attempts - hits}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
