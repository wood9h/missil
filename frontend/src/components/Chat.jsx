import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Chat({ messages, onSend, mySide }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 p-2 min-h-0" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">Nenhuma mensagem ainda</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`text-xs px-2 py-1 rounded ${msg.side === mySide ? "bg-blue-900/40 text-blue-200" : "bg-red-900/40 text-red-200"}`}>
            <span className="font-semibold">{msg.from}: </span>
            <span>{msg.message}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1 p-2 border-t border-slate-700">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Mensagem..."
          className="bg-slate-700 border-slate-600 text-white text-xs h-8"
          data-testid="chat-input"
        />
        <Button onClick={send} size="sm" className="bg-slate-600 hover:bg-slate-500 h-8 px-2" data-testid="chat-send-btn">
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
