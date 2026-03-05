# Guerra Fria: Duelo de Mísseis Intercontinentais - PRD

## Problema Original
Jogo de artilharia com tema de física da Guerra Fria, evoluído para um jogo **multiplayer online** com sistema de salas.

## Requisitos Implementados

### Autenticação
- Login com email/senha (JWT via cookie httpOnly)
- Login social com Google (Emergent Auth)
- Sessões com expiração de 7 dias
- WS-Token endpoint para autenticação WebSocket

### Lobby (Sala de Espera)
- Criação de salas com nome personalizado
- Lista de salas disponíveis (atualizada a cada 3 segundos)
- Indicação de salas em andamento
- Limpeza automática de salas antigas (>30 min)
- Botão para modo Solo

### Duelo Multiplayer Online
- Sorteio aleatório de lados (USA/URSS) para cada jogador
- Ambos jogadores veem o mesmo canvas
- Cada rodada, jogador escolhe:
  - **Atacar**: Define ângulo + velocidade, lança míssil ofensivo
  - **Defender**: Define tempo de reação, lança antimíssil automático
- Rodadas simultâneas (ambos clicam "Pronto", round inicia)
- Interceptação: antimíssil colide com míssil inimigo no ar (sem pontuação)
- Pontos: somente quando acerta a base inimiga
- Primeiro a 5 pontos vence
- Posições aleatórias a cada rodada

### Comunicação em Tempo Real
- Chat de texto via WebSocket
- Chat de voz via WebRTC (com WebSocket para sinalização)

### Modo Solo (Defesa Antimíssil)
- Jogador controla EUA vs IA soviética
- URSS decide entre contra-atacar ou interceptar
- Condição de vitória: Primeiro a 5

### Visual e Áudio
- Canvas HTML5 1200x600 com mapa-múndi
- Torres de lançamento (USA azul, URSS vermelha)
- Sprites de mísseis com orientação dinâmica
- Trajetórias coloridas (azul=USA, vermelho=USSR, cyan=interceptor)
- Explosões com cogumelo atômico
- Sons via Web Audio API (lançamento, explosão, alerta)

## Arquitetura

```
/app
├── backend/
│   └── server.py          # FastAPI - Auth, Rooms, WebSocket, Physics
├── frontend/
│   ├── src/
│   │   ├── App.js                      # Router + AuthProvider
│   │   ├── contexts/AuthContext.jsx     # Auth state management
│   │   ├── pages/
│   │   │   ├── Login.jsx               # Login/Register + Google OAuth
│   │   │   ├── AuthCallback.jsx        # OAuth callback handler
│   │   │   ├── Lobby.jsx               # Room lobby
│   │   │   ├── MultiplayerGame.jsx     # Multiplayer game
│   │   │   └── Game.jsx                # Single player (Defesa Antimíssil)
│   │   └── components/
│   │       ├── Chat.jsx                # Text chat
│   │       └── VoiceChat.jsx           # WebRTC voice chat
│   └── package.json
└── memory/PRD.md
```

## API Endpoints
- POST /api/auth/register - Registro com email/senha
- POST /api/auth/login - Login com email/senha
- POST /api/auth/session - Troca session_id Google por sessão
- GET /api/auth/me - Dados do usuário autenticado
- POST /api/auth/logout - Logout
- GET /api/auth/ws-token - Token temporário para WebSocket
- POST /api/rooms - Criar sala
- GET /api/rooms - Listar salas
- POST /api/rooms/{id}/join - Entrar em sala
- DELETE /api/rooms/{id} - Sair/deletar sala
- WS /api/ws/{room_id}?token= - WebSocket do jogo

## DB Collections (MongoDB)
- users: user_id, email, name, picture, password_hash, created_at
- user_sessions: user_id, session_token, expires_at
- ws_tokens: token, user_id, expires_at
- rooms: room_id, name, host_id, guest_id, host_side, guest_side, status

## Backlog

### P1
- [ ] Tratamento de reconexão WebSocket (auto-retry)
- [ ] Indicação visual de qual lado o jogador está mais claramente no canvas

### P2
- [ ] Ranking/placar histórico de vitórias
- [ ] Modo espectador
- [ ] Animações de entrada/vitória mais elaboradas

### P3
- [ ] Diferentes tipos de mísseis
- [ ] Power-ups
- [ ] Sistema de progressão/níveis
