import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Play, Shield, RotateCcw, ArrowLeft, MessageSquare } from "lucide-react";
import { Chat } from "../components/Chat";
import { VoiceChat } from "../components/VoiceChat";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 600;
const SCALE = 4;
const GRAVITY = 9.8;
const WINNING_SCORE = 5;
const INTERCEPT_RADIUS = 40;

export default function MultiplayerGame() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Game state
  const [mySide, setMySide] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [gamePhase, setGamePhase] = useState("connecting"); // connecting, waiting, setup, ready, playing, result, gameover
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState({ usa: 0, ussr: 0 });
  const [winner, setWinner] = useState(null);

  // Positions
  const [wallPos, setWallPos] = useState({ x: 400, width: 25, height: 200 });
  const [usaPos, setUsaPos] = useState({ x: 50, y: 30 });
  const [ussrPos, setUssrPos] = useState({ x: 900, y: 30, width: 60, height: 60 });
  const wallRef = useRef(wallPos);
  const usaPosRef = useRef(usaPos);
  const ussrPosRef = useRef(ussrPos);

  useEffect(() => { wallRef.current = wallPos; }, [wallPos]);
  useEffect(() => { usaPosRef.current = usaPos; }, [usaPos]);
  useEffect(() => { ussrPosRef.current = ussrPos; }, [ussrPos]);

  // Controls
  const [action, setAction] = useState("attack");
  const [angle, setAngle] = useState(45);
  const [velocity, setVelocity] = useState(30);
  const [timing, setTiming] = useState(2.0);
  const [isReady, setIsReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  // Animation
  const projectilesRef = useRef([]);
  const explosionsRef = useRef([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [trajectory, setTrajectory] = useState([]);

  // Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);

  // Map image
  const [mapImage, setMapImage] = useState(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "https://images.unsplash.com/photo-1742415105376-43d3a5fd03fc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwyfHxmbGF0JTIwd29ybGQlMjBhdGxhcyUyMGNvbnRpbmVudHMlMjB2aW50YWdlfGVufDB8fHx8MTc3MDg5MjMxOHww&ixlib=rb-4.1.0&q=85&w=1200&h=600&fit=crop";
    img.onload = () => setMapImage(img);
  }, []);

  // Refs for animation closure
  const mySideRef = useRef(mySide);
  const scoresRef = useRef(scores);
  useEffect(() => { mySideRef.current = mySide; }, [mySide]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  // Audio
  const getAudioCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };
  const playLaunchSound = (isUSSR) => {
    try {
      const ctx = getAudioCtx(); const now = ctx.currentTime;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(isUSSR ? 150 : 180, now);
      osc.frequency.exponentialRampToValueAtTime(isUSSR ? 400 : 500, now + 0.3);
      gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 1);
    } catch {}
  };
  const playExplosionSound = () => {
    try {
      const ctx = getAudioCtx(); const now = ctx.currentTime;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
      gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.6);
    } catch {}
  };

  // WebSocket connection
  useEffect(() => {
    if (!user) return;
    let ws = null;
    let cancelled = false;

    const connect = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/ws-token`, { credentials: "include" });
        if (!res.ok) return;
        const { ws_token } = await res.json();
        if (cancelled) return;

        ws = new WebSocket(`${WS_URL}/${roomId}?token=${ws_token}`);
        wsRef.current = ws;

        ws.onopen = () => setGamePhase("waiting");
        ws.onclose = () => { if (!cancelled) { setGamePhase("connecting"); toast.error("Conexão perdida"); } };
        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          handleWsMessage(data);
        };
      } catch {
        toast.error("Erro ao conectar");
      }
    };
    connect();

    return () => { cancelled = true; if (ws) ws.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, roomId]);

  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case "connected":
        setMySide(data.side);
        setOpponent(data.opponent);
        break;
      case "opponent_connected":
        setOpponent(data.name);
        toast.info(`${data.name} conectou!`);
        break;
      case "game_start":
        setGamePhase("setup");
        applyGameState(data.game_state);
        toast.success("Jogo iniciado!");
        break;
      case "opponent_ready":
        setOpponentReady(true);
        toast.info("Oponente pronto!");
        break;
      case "round_start":
        handleRoundStart(data.actions);
        break;
      case "new_round":
        setRound(data.round);
        setScores(data.scores);
        setWallPos(data.wall);
        setUsaPos(data.usa_pos);
        setUssrPos(data.ussr_pos);
        setGamePhase("setup");
        setIsReady(false);
        setOpponentReady(false);
        setTrajectory([]);
        projectilesRef.current = [];
        explosionsRef.current = [];
        break;
      case "game_over":
        setWinner(data.winner);
        setScores(data.scores);
        setGamePhase("gameover");
        if (data.winner === mySideRef.current) {
          toast.success("VITÓRIA!", { duration: 10000 });
        } else {
          toast.error("DERROTA!", { duration: 10000 });
        }
        break;
      case "opponent_left":
        toast.error("Oponente saiu da partida");
        setGamePhase("gameover");
        setWinner(mySideRef.current);
        break;
      case "chat":
        setChatMessages((prev) => [...prev, { from: data.from, message: data.message, side: data.side }]);
        break;
      case "voice_signal":
        if (wsRef.current?._voiceHandler) wsRef.current._voiceHandler(data.signal);
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyGameState = (gs) => {
    setRound(gs.round);
    setScores(gs.scores);
    setWallPos(gs.wall);
    setUsaPos(gs.usa_pos);
    setUssrPos(gs.ussr_pos);
  };

  const handleRoundStart = (actions) => {
    setGamePhase("playing");
    setIsAnimating(true);
    setTrajectory([]);
    projectilesRef.current = [];
    explosionsRef.current = [];

    const curUsaPos = usaPosRef.current;
    const curUssrPos = ussrPosRef.current;
    const usaAction = actions.usa;
    const ussrAction = actions.ussr;

    // Launch USA attack missile
    if (usaAction.action === "attack") {
      const aRad = (usaAction.angle * Math.PI) / 180;
      playLaunchSound(false);
      projectilesRef.current.push({
        id: "usa-atk", startX: curUsaPos.x, startY: curUsaPos.y,
        x: curUsaPos.x, y: curUsaPos.y,
        vx: usaAction.velocity * Math.cos(aRad), vy: usaAction.velocity * Math.sin(aRad),
        t: 0, isUSSR: false, isInterceptor: false,
        trajectoryPoints: [{ x: curUsaPos.x, y: curUsaPos.y }], active: true,
      });
    }

    // Launch USSR attack missile
    if (ussrAction.action === "attack") {
      const aRad = (ussrAction.angle * Math.PI) / 180;
      playLaunchSound(true);
      const lx = curUssrPos.x + (curUssrPos.width || 60) / 2;
      projectilesRef.current.push({
        id: "ussr-atk", startX: lx, startY: 50,
        x: lx, y: 50,
        vx: -ussrAction.velocity * Math.cos(aRad), vy: ussrAction.velocity * Math.sin(aRad),
        t: 0, isUSSR: true, isInterceptor: false,
        trajectoryPoints: [{ x: lx, y: 50 }], active: true,
      });
    }

    // Schedule antimissil launches
    if (usaAction.action === "defend" && ussrAction.action === "attack") {
      setTimeout(() => launchAntimissil("usa"), (usaAction.timing || 2) * 1000);
    }
    if (ussrAction.action === "defend" && usaAction.action === "attack") {
      setTimeout(() => launchAntimissil("ussr"), (ussrAction.timing || 2) * 1000);
    }

    // If both defend, skip round
    if (usaAction.action === "defend" && ussrAction.action === "defend") {
      toast.info("Ambos defenderam! Nenhum míssil lançado.");
      setTimeout(() => endRound(), 2000);
    }
  };

  const launchAntimissil = (side) => {
    const enemy = projectilesRef.current.find((p) => (side === "usa" ? p.isUSSR : !p.isUSSR) && p.active && !p.isInterceptor);
    if (!enemy) return;
    playLaunchSound(side === "ussr");

    const curUsaPos = usaPosRef.current;
    const curUssrPos = ussrPosRef.current;
    const lx = side === "usa" ? curUsaPos.x : curUssrPos.x + (curUssrPos.width || 60) / 2;
    const ly = 50;

    const pTime = 1.0 + Math.random() * 0.5;
    const px = enemy.startX + enemy.vx * SCALE * (enemy.t + pTime);
    const py = enemy.startY + enemy.vy * SCALE * (enemy.t + pTime) - 0.5 * GRAVITY * SCALE * (enemy.t + pTime) ** 2;

    const dx = lx - px;
    const dy = py - ly;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const jitter = (Math.random() - 0.5) * 0.25;
    const iAngle = Math.atan2(dy, dx) + jitter;
    const iVel = Math.max(25, Math.min(70, dist / (pTime * SCALE) * 1.2));

    const vx = side === "usa" ? iVel * Math.cos(iAngle) : -iVel * Math.cos(iAngle);
    const vy = iVel * Math.sin(iAngle);

    projectilesRef.current.push({
      id: `${side}-def`, startX: lx, startY: ly, x: lx, y: ly,
      vx, vy, t: 0, isUSSR: side === "ussr", isInterceptor: true,
      trajectoryPoints: [{ x: lx, y: ly }], active: true,
    });
    toast.warning(side === mySideRef.current ? "Antimíssil lançado!" : "Oponente lançou antimíssil!");
  };

  const endRound = () => {
    setIsAnimating(false);
    setGamePhase("setup");
    setIsReady(false);
    setOpponentReady(false);
    // Report results to server
    const sc = scoresRef.current;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "round_result", scores: sc }));
    }
  };

  // Ready action
  const submitReady = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg = { type: "ready", action };
    if (action === "attack") { msg.angle = angle; msg.velocity = velocity; }
    else { msg.timing = timing; }
    wsRef.current.send(JSON.stringify(msg));
    setIsReady(true);
  };

  const sendChat = (message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "chat", message }));
    }
  };

  // ===== CANVAS DRAWING =====
  const drawMissile = (ctx, x, y, tPoints, isUSSR) => {
    const pts = tPoints.slice(-2);
    let ma = isUSSR ? Math.PI : 0;
    if (pts.length >= 2) { ma = Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x); }
    const mx = x, my = CANVAS_HEIGHT - y - 30;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ma);
    ctx.fillStyle = isUSSR ? "#E23636" : "#4A90E2";
    ctx.fillRect(-12, -4, 24, 8);
    ctx.beginPath(); ctx.moveTo(12, -4); ctx.lineTo(18, 0); ctx.lineTo(12, 4); ctx.closePath();
    ctx.fillStyle = isUSSR ? "#B22222" : "#2C5F8D"; ctx.fill();
    ctx.fillStyle = isUSSR ? "#FF4444" : "#5BA3E8";
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-18, -8); ctx.lineTo(-15, -4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(-18, 8); ctx.lineTo(-15, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = isUSSR ? "#FFD700" : "#FFFFFF"; ctx.fillRect(0, -3, 8, 6);
    ctx.fillStyle = "rgba(255, 150, 50, 0.8)";
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-20, 0); ctx.lineTo(-12, 2); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = isUSSR ? "rgba(226,54,54,0.3)" : "rgba(74,144,226,0.3)";
    ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill();
  };

  const drawTrail = (ctx, pts, isUSSR, isInt) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = isInt ? "#00E5FF" : isUSSR ? "#E23636" : "#4A90E2";
    ctx.lineWidth = isInt ? 2 : 3;
    ctx.shadowColor = isInt ? "#00BCD4" : isUSSR ? "#FF0000" : "#0066FF";
    ctx.shadowBlur = 10;
    ctx.setLineDash(isInt ? [6, 4] : []);
    ctx.beginPath();
    pts.forEach((p, i) => { const sx = p.x, sy = CANVAS_HEIGHT - p.y - 30; i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy); });
    ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
  };

  const drawExplosion = (ctx, x, y, frame, maxFrames) => {
    const p = frame / maxFrames, s = 30 * (1 + p * 1.5), cy = CANVAS_HEIGHT - y - 30;
    if (frame < 5) { ctx.fillStyle = `rgba(255,255,255,${1 - frame / 5})`; ctx.beginPath(); ctx.arc(x, cy, s * 3, 0, Math.PI * 2); ctx.fill(); }
    if (p < 0.8) {
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, s * (1.2 - p * 0.3));
      g.addColorStop(0, `rgba(255,255,220,${0.9 - p * 0.7})`); g.addColorStop(0.5, `rgba(255,180,50,${0.8 - p * 0.6})`); g.addColorStop(1, `rgba(150,30,0,${0.5 - p * 0.4})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, s * (1.2 - p * 0.3), 0, Math.PI * 2); ctx.fill();
    }
    if (p > 0.3) {
      const sp = (p - 0.3) / 0.7, sh = s * 2 * sp, st = cy - sh;
      ctx.fillStyle = `rgba(80,40,25,${0.8 - p * 0.4})`; ctx.fillRect(x - s * 0.3, st, s * 0.6, sh);
      if (p > 0.5) { const cr = s * 1.1 * ((p - 0.5) / 0.5); ctx.fillStyle = `rgba(100,60,40,${0.7 - p * 0.4})`; ctx.beginPath(); ctx.ellipse(x, st, cr, cr * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  };

  const drawCanvas = useCallback((ctx, projs, exps) => {
    const w = wallRef.current, uPos = usaPosRef.current, sPos = ussrPosRef.current;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (mapImage) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(mapImage, mapImage.width * 0.5, 0, mapImage.width * 0.5, mapImage.height, 0, 0, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT);
      ctx.drawImage(mapImage, 0, 0, mapImage.width * 0.5, mapImage.height, CANVAS_WIDTH * 0.5, 0, CANVAS_WIDTH * 0.5, CANVAS_HEIGHT);
      ctx.globalAlpha = 1;
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      g.addColorStop(0, "#1a4d6d"); g.addColorStop(1, "#3d82b8");
      ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    for (let y = 100; y < CANVAS_HEIGHT - 30; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }
    for (let x = 100; x < CANVAS_WIDTH; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT - 30); ctx.stroke(); }
    ctx.setLineDash([]);

    // Ground
    ctx.strokeStyle = "#1a3a4a"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, CANVAS_HEIGHT - 30); ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 30); ctx.stroke();

    // Trails
    projs.forEach((p) => { if (p.trajectoryPoints?.length > 1) drawTrail(ctx, p.trajectoryPoints, p.isUSSR, p.isInterceptor); });

    // USA tower
    const cx = uPos.x, cy2 = CANVAS_HEIGHT - 30;
    ctx.fillStyle = "#2C3E50"; ctx.fillRect(cx - 35, cy2 - 5, 70, 5); ctx.fillRect(cx - 30, cy2 - 10, 60, 5);
    ctx.fillStyle = "#34495E"; ctx.fillRect(cx - 25, cy2 - 35, 8, 30); ctx.fillRect(cx + 17, cy2 - 35, 8, 30);
    ctx.fillRect(cx - 15, cy2 - 60, 30, 25);
    ctx.fillStyle = "#5A6F8F"; ctx.beginPath(); ctx.ellipse(cx, cy2 - 65, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#7F8C8D"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy2 - 65); ctx.lineTo(cx, cy2 - 80); ctx.stroke();
    ctx.fillStyle = "#E74C3C"; ctx.beginPath(); ctx.arc(cx, cy2 - 80, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.fillText("USA", cx, cy2 - 85);

    // Wall
    ctx.fillStyle = "#5D4E37"; ctx.fillRect(w.x, CANVAS_HEIGHT - w.height - 30, w.width, w.height);
    ctx.fillStyle = "#8B7355"; ctx.beginPath();
    for (let i = 0; i < w.width; i += 8) { ctx.moveTo(w.x + i, CANVAS_HEIGHT - 30); ctx.lineTo(w.x + i + 4, CANVAS_HEIGHT - w.height - 30 - 10); ctx.lineTo(w.x + i + 8, CANVAS_HEIGHT - 30); }
    ctx.fill();
    ctx.fillStyle = "#FFFFFF"; for (let i = 0; i < 3; i++) ctx.fillRect(w.x + (w.width / 4) * i, CANVAS_HEIGHT - w.height - 30, w.width / 4, 5);

    // USSR tower
    const tx = sPos.x + (sPos.width || 60) / 2, tby = CANVAS_HEIGHT - 30;
    ctx.fillStyle = "#8B0000"; ctx.fillRect(tx - 30, tby - 10, 60, 10);
    ctx.fillStyle = "#A52A2A"; ctx.fillRect(tx - 15, tby - 60, 30, 50);
    ctx.strokeStyle = "#CD5C5C"; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(tx - 15, tby - 15 - i * 12); ctx.lineTo(tx + 15, tby - 15 - i * 12); ctx.stroke(); }
    ctx.fillStyle = "#DC143C"; ctx.beginPath(); ctx.ellipse(tx, tby - 65, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8B0000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, tby - 65); ctx.lineTo(tx, tby - 80); ctx.stroke();
    ctx.fillStyle = "#FFD700"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.fillText("★", tx, tby - 76);
    ctx.fillStyle = "#FFFFFF"; ctx.fillText("CCCP", tx, tby - 85);

    // Missiles on platforms (when not active)
    const usaHasActive = projs.some((p) => !p.isUSSR && p.active && !p.isInterceptor);
    if (!usaHasActive) {
      ctx.save(); ctx.translate(cx, cy2 - 32); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = "#4A90E2"; ctx.fillRect(5, -4, 24, 8);
      ctx.fillStyle = "#2C5F8D"; ctx.beginPath(); ctx.moveTo(29, -4); ctx.lineTo(35, 0); ctx.lineTo(29, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    const ussrHasActive = projs.some((p) => p.isUSSR && p.active && !p.isInterceptor);
    if (!ussrHasActive) {
      ctx.save(); ctx.translate(tx - 25, tby - 50); ctx.rotate(-Math.PI * 3 / 4);
      ctx.fillStyle = "#E23636"; ctx.fillRect(0, -4, 24, 8);
      ctx.fillStyle = "#B22222"; ctx.beginPath(); ctx.moveTo(24, -4); ctx.lineTo(30, 0); ctx.lineTo(24, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Active missiles
    projs.forEach((p) => { if (p.active && p.trajectoryPoints?.length > 0) drawMissile(ctx, p.x, p.y, p.trajectoryPoints, p.isUSSR); });
    // Explosions
    exps.forEach((e) => drawExplosion(ctx, e.x, e.y, e.frame, e.maxFrames));
  }, [mapImage]);

  // Static canvas draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawCanvas(ctx, projectilesRef.current, explosionsRef.current);
  }, [wallPos, usaPos, ussrPos, trajectory, mapImage, drawCanvas]);

  // Animation loop
  useEffect(() => {
    let fId = null;
    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) { fId = requestAnimationFrame(animate); return; }
      const ctx = canvas.getContext("2d");
      const dt = 0.016;
      let anyActive = false;

      projectilesRef.current.forEach((p) => {
        if (!p.active) return;
        anyActive = true;
        p.t += dt;
        p.x = p.startX + p.vx * SCALE * p.t;
        p.y = p.startY + p.vy * SCALE * p.t - 0.5 * GRAVITY * SCALE * p.t * p.t;
        p.trajectoryPoints.push({ x: p.x, y: p.y });

        let col = null;
        const w = wallRef.current, uPos = usaPosRef.current, sPos = ussrPosRef.current;

        if (p.y <= 0) col = "ground";
        else if (p.x >= w.x && p.x <= w.x + w.width && p.y <= w.height) col = "wall";

        if (!p.isInterceptor) {
          if (!p.isUSSR && p.x >= sPos.x && p.x <= sPos.x + (sPos.width || 60) && p.y <= (sPos.height || 60)) col = "target";
          if (p.isUSSR && p.x >= uPos.x - 30 && p.x <= uPos.x + 30 && p.y <= 50) col = "usa_base";
        }

        if (col || p.t >= 10 || p.x < -50 || p.x > CANVAS_WIDTH + 50) {
          p.active = false;
          if (col === "target" || col === "usa_base") {
            playExplosionSound();
            explosionsRef.current.push({ x: p.x, y: p.y, frame: 0, maxFrames: 60 });
            if (col === "target") {
              setScores((prev) => { const n = { ...prev, usa: prev.usa + 1 }; scoresRef.current = n; return n; });
              toast.success("Alvo URSS atingido!");
            } else {
              setScores((prev) => { const n = { ...prev, ussr: prev.ussr + 1 }; scoresRef.current = n; return n; });
              toast.error("Base USA atingida!");
            }
          } else if (col === "wall") {
            playExplosionSound();
            explosionsRef.current.push({ x: p.x, y: p.y, frame: 0, maxFrames: 40 });
          } else if (col === "ground") {
            explosionsRef.current.push({ x: p.x, y: p.y, frame: 0, maxFrames: 30 });
          }
        }
      });

      // Missile-to-missile intercept
      const actProjs = projectilesRef.current.filter((p) => p.active);
      const attackers = actProjs.filter((p) => !p.isInterceptor);
      const defenders = actProjs.filter((p) => p.isInterceptor);
      for (const atk of attackers) {
        for (const def of defenders) {
          if (atk.isUSSR === def.isUSSR) continue; // same side can't intercept own
          const dx = atk.x - def.x, dy = atk.y - def.y;
          if (Math.sqrt(dx * dx + dy * dy) < INTERCEPT_RADIUS) {
            atk.active = false; def.active = false;
            const mx = (atk.x + def.x) / 2, my = (atk.y + def.y) / 2;
            explosionsRef.current.push({ x: mx, y: my, frame: 0, maxFrames: 50 });
            playExplosionSound();
            toast.warning("INTERCEPTAÇÃO! Míssil destruído no ar!");
          }
        }
      }

      // Update explosions
      explosionsRef.current = explosionsRef.current.filter((e) => { e.frame++; return e.frame < e.maxFrames; });

      drawCanvas(ctx, projectilesRef.current, explosionsRef.current);

      const stillActive = projectilesRef.current.some((p) => p.active);
      if (!stillActive && anyActive && explosionsRef.current.length === 0) {
        // Round finished
        setTimeout(() => endRound(), 1500);
      }

      fId = requestAnimationFrame(animate);
    };
    fId = requestAnimationFrame(animate);
    return () => { if (fId) cancelAnimationFrame(fId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawCanvas]);

  const sideLabel = mySide === "usa" ? "🇺🇸 EUA" : "🚩 URSS";
  const oppSideLabel = mySide === "usa" ? "🚩 URSS" : "🇺🇸 EUA";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-3 flex flex-col" data-testid="multiplayer-game">
      {/* Header */}
      <header className="mb-3 flex flex-col items-center text-center">
        <div className="flex items-center gap-3 mb-1">
          <Button onClick={() => navigate("/lobby")} variant="ghost" size="sm" className="text-slate-400 hover:text-white" data-testid="back-btn">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-white">Duelo: {sideLabel}</h1>
          <VoiceChat wsRef={wsRef} isConnected={gamePhase !== "connecting"} />
        </div>
        {opponent && <p className="text-xs text-slate-400">vs {opponent} ({oppSideLabel})</p>}

        {/* Scoreboard */}
        <div className="flex items-center gap-4 mt-3">
          <div className={`rounded-xl px-5 py-2 border-2 ${scores.usa >= WINNING_SCORE ? "bg-emerald-600 border-emerald-400" : "bg-blue-600 border-blue-500"}`}>
            <div className="text-xs text-blue-200">🇺🇸 USA</div>
            <div className="text-2xl font-bold text-white font-mono" data-testid="score-usa">{scores.usa}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-400">VS</div>
            <div className="text-[10px] text-slate-500">Primeiro a {WINNING_SCORE}</div>
            <div className="text-[10px] text-amber-400">Round {round}</div>
          </div>
          <div className={`rounded-xl px-5 py-2 border-2 ${scores.ussr >= WINNING_SCORE ? "bg-emerald-600 border-emerald-400" : "bg-red-600 border-red-500"}`}>
            <div className="text-xs text-red-200">🚩 CCCP</div>
            <div className="text-2xl font-bold text-white font-mono" data-testid="score-ussr">{scores.ussr}</div>
          </div>
        </div>

        {/* Phase Banner */}
        {gamePhase === "connecting" && <div className="mt-3 text-slate-400 text-sm">Conectando...</div>}
        {gamePhase === "waiting" && <div className="mt-3 text-amber-400 text-sm animate-pulse">Aguardando oponente...</div>}
        {gamePhase === "gameover" && winner && (
          <div className={`mt-3 px-6 py-3 rounded-xl ${winner === mySide ? "bg-emerald-600" : "bg-red-600"} animate-pulse`}>
            <div className="text-xl font-bold text-white">{winner === mySide ? "VITÓRIA!" : "DERROTA!"}</div>
            <Button onClick={() => navigate("/lobby")} variant="ghost" className="text-white/80 text-sm mt-1" data-testid="back-to-lobby-btn">
              Voltar ao Lobby
            </Button>
          </div>
        )}
      </header>

      {/* Main Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 items-start justify-center max-w-7xl mx-auto w-full">
        {/* Canvas */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-2 flex-shrink-0">
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
            className="rounded border border-slate-600 max-w-full h-auto"
            style={{ maxHeight: "calc(100vh - 280px)" }} data-testid="game-canvas" />
        </div>

        {/* Side Panel */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          {/* Controls */}
          {(gamePhase === "setup" || gamePhase === "ready") && !winner && (
            <div className="bg-slate-800/90 rounded-xl border border-slate-700 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Sua Ação</div>
              <div className="flex gap-2">
                <Button onClick={() => setAction("attack")} disabled={isReady}
                  className={`flex-1 text-sm ${action === "attack" ? "bg-red-600 text-white" : "bg-slate-700 text-slate-300"}`} data-testid="action-attack">
                  <Play className="h-3 w-3 mr-1" /> Atacar
                </Button>
                <Button onClick={() => setAction("defend")} disabled={isReady}
                  className={`flex-1 text-sm ${action === "defend" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300"}`} data-testid="action-defend">
                  <Shield className="h-3 w-3 mr-1" /> Defender
                </Button>
              </div>

              {action === "attack" ? (
                <>
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 block mb-1">Ângulo</label>
                    <div className="flex items-center gap-2">
                      <Slider value={[angle]} onValueChange={(v) => setAngle(v[0])} min={5} max={85} step={1} disabled={isReady} className="flex-1" data-testid="angle-slider" />
                      <span className="text-sm font-mono text-emerald-400 w-10 text-right">{angle}°</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 block mb-1">Velocidade</label>
                    <div className="flex items-center gap-2">
                      <Slider value={[velocity]} onValueChange={(v) => setVelocity(v[0])} min={10} max={80} step={1} disabled={isReady} className="flex-1" data-testid="velocity-slider" />
                      <span className="text-sm font-mono text-emerald-400 w-10 text-right">{velocity}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Tempo de Reação (seg)</label>
                  <div className="flex items-center gap-2">
                    <Slider value={[timing]} onValueChange={(v) => setTiming(v[0])} min={0.5} max={4} step={0.1} disabled={isReady} className="flex-1" data-testid="timing-slider" />
                    <span className="text-sm font-mono text-cyan-400 w-10 text-right">{timing.toFixed(1)}s</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Tempo antes de lançar o antimíssil</p>
                </div>
              )}

              <Button onClick={submitReady} disabled={isReady}
                className={`w-full py-4 font-bold ${isReady ? "bg-slate-600" : "bg-emerald-600 hover:bg-emerald-500"} text-white`} data-testid="ready-btn">
                {isReady ? (opponentReady ? "Iniciando..." : "Esperando oponente...") : "Pronto!"}
              </Button>
              {opponentReady && !isReady && <p className="text-amber-400 text-xs text-center animate-pulse">Oponente pronto!</p>}
            </div>
          )}

          {gamePhase === "playing" && (
            <div className="bg-slate-800/90 rounded-xl border border-amber-700 p-4 text-center">
              <div className="text-amber-400 font-bold animate-pulse">Mísseis em voo!</div>
            </div>
          )}

          {/* Chat */}
          <div className="bg-slate-800/90 rounded-xl border border-slate-700 overflow-hidden">
            <button onClick={() => setShowChat(!showChat)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-300 hover:bg-slate-700/50" data-testid="toggle-chat">
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Chat</span>
              <span>{showChat ? "▲" : "▼"}</span>
            </button>
            {showChat && (
              <div className="h-48 border-t border-slate-700">
                <Chat messages={chatMessages} onSend={sendChat} mySide={mySide} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
