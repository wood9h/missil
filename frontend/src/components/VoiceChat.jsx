import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VoiceChat({ wsRef, isConnected }) {
  const [active, setActive] = useState(false);
  const [remoteActive, setRemoteActive] = useState(false);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const sendSignal = useCallback((signal) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "voice_signal", signal }));
    }
  }, [wsRef]);

  const handleSignal = useCallback(async (signal) => {
    if (!pcRef.current) return;
    try {
      if (signal.type === "offer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        sendSignal(answer);
      } else if (signal.type === "answer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(signal));
      }
    } catch (e) {
      console.error("WebRTC signal error:", e);
    }
  }, [sendSignal]);

  // Expose handleSignal for parent to call
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current._voiceHandler = handleSignal;
    }
  }, [wsRef, handleSignal]);

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(e.candidate.toJSON());
      };

      pc.ontrack = (e) => {
        setRemoteActive(true);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(offer);

      setActive(true);
    } catch (e) {
      console.error("Voice error:", e);
    }
  };

  const stopVoice = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setActive(false);
    setRemoteActive(false);
  };

  useEffect(() => {
    return () => stopVoice();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <audio ref={remoteAudioRef} autoPlay />
      <Button
        onClick={active ? stopVoice : startVoice}
        disabled={!isConnected}
        size="sm"
        className={`${active ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"} text-white`}
        data-testid="voice-toggle-btn"
      >
        {active ? <MicOff className="h-4 w-4 mr-1" /> : <Mic className="h-4 w-4 mr-1" />}
        {active ? "Desligar Voz" : "Voz"}
      </Button>
      {remoteActive && <span className="text-emerald-400 text-xs">Oponente conectado</span>}
    </div>
  );
}
