import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Users, LogOut, Gamepad2, Swords } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function Lobby() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(null);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API}/rooms`, { credentials: "include" });
      if (res.ok) setRooms(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const createRoom = async () => {
    if (!roomName.trim()) return toast.error("Dê um nome à sala");
    setCreating(true);
    try {
      const res = await fetch(`${API}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: roomName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const room = await res.json();
      navigate(`/game/${room.room_id}`);
    } catch (err) {
      toast.error(err.message);
    }
    setCreating(false);
  };

  const joinRoom = async (roomId) => {
    setJoining(roomId);
    try {
      const res = await fetch(`${API}/rooms/${roomId}/join`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      navigate(`/game/${roomId}`);
    } catch (err) {
      toast.error(err.message);
    }
    setJoining(null);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const waitingRooms = rooms.filter((r) => r.status === "waiting" && r.host_id !== user?.user_id);
  const myRoom = rooms.find((r) => r.host_id === user?.user_id && r.status === "waiting");
  const playingRooms = rooms.filter((r) => r.status === "playing");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Sala de Guerra</h1>
            <p className="text-slate-400 text-sm mt-1">
              Olá, <span className="text-white font-medium">{user?.name}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => navigate("/singleplayer")}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="singleplayer-btn"
            >
              <Gamepad2 className="h-4 w-4 mr-1" /> Solo
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>

        {/* Create Room */}
        {!myRoom && (
          <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Criar Sala</h2>
            <div className="flex gap-3">
              <Input
                placeholder="Nome da sala..."
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white flex-1"
                data-testid="room-name-input"
                onKeyDown={(e) => e.key === "Enter" && createRoom()}
              />
              <Button
                onClick={createRoom}
                disabled={creating}
                className="bg-red-600 hover:bg-red-500 text-white px-6"
                data-testid="create-room-btn"
              >
                <Plus className="h-4 w-4 mr-1" /> Criar
              </Button>
            </div>
          </div>
        )}

        {/* My Waiting Room */}
        {myRoom && (
          <div className="bg-emerald-900/30 rounded-2xl border border-emerald-700 p-5 animate-pulse">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg">{myRoom.name}</h3>
                <p className="text-emerald-400 text-sm">Aguardando oponente...</p>
              </div>
              <Button
                onClick={() => navigate(`/game/${myRoom.room_id}`)}
                className="bg-emerald-600 hover:bg-emerald-500"
                data-testid="enter-my-room-btn"
              >
                Entrar na Sala
              </Button>
            </div>
          </div>
        )}

        {/* Available Rooms */}
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Swords className="h-4 w-4" /> Salas Disponíveis
          </h2>
          {waitingRooms.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Nenhuma sala disponível. Crie uma!</p>
          ) : (
            <div className="space-y-2">
              {waitingRooms.map((room) => (
                <div
                  key={room.room_id}
                  className="flex items-center justify-between bg-slate-700/50 rounded-xl px-4 py-3 border border-slate-600"
                >
                  <div>
                    <span className="text-white font-medium">{room.name}</span>
                    <span className="text-slate-400 text-xs ml-2">por {room.host_name}</span>
                  </div>
                  <Button
                    onClick={() => joinRoom(room.room_id)}
                    disabled={joining === room.room_id}
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                    data-testid={`join-room-${room.room_id}`}
                  >
                    <Users className="h-4 w-4 mr-1" /> {joining === room.room_id ? "..." : "Entrar"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Playing Rooms */}
        {playingRooms.length > 0 && (
          <div className="bg-slate-800/80 rounded-2xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Em Andamento</h2>
            <div className="space-y-2">
              {playingRooms.map((room) => (
                <div
                  key={room.room_id}
                  className="flex items-center justify-between bg-slate-700/50 rounded-xl px-4 py-3 border border-slate-600 opacity-60"
                >
                  <span className="text-white">{room.name}</span>
                  <span className="text-amber-400 text-xs font-medium">Jogando</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
