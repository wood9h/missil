# Guerra Fria: Cálculo Balístico - PRD

## Problema Original
Jogo de artilharia com tema de física da Guerra Fria. Um canhão (EUA) à esquerda, um alvo (URSS) à direita e obstáculos no meio. O jogador insere ângulo e velocidade para calcular um lançamento oblíquo e tentar acertar o alvo.

## Requisitos do Produto

### Gameplay Principal
- Canhão dos EUA à esquerda lança mísseis intercontinentais
- Alvo soviético (URSS) à direita deve ser atingido
- Obstáculo (montanhas) no centro bloqueia trajetórias baixas
- Jogador ajusta ângulo (0-90°) e velocidade (10-80 m/s)
- Física de lançamento oblíquo aplicada
- Posições aleatórias a cada rodada

### Design e Tema
- Tema da Guerra Fria (EUA vs União Soviética)
- Mapa-múndi real como fundo
- Torres de lançamento de mísseis detalhadas
- Sprites de mísseis orientados pela trajetória
- Layout centralizado com tema escuro imersivo
- Linha de mira mostrando ângulo de lançamento

### Níveis de Dificuldade
- **Fácil**: Obstáculos menores, alvos mais próximos
- **Médio**: Configuração padrão
- **Difícil**: Obstáculos maiores, alvos mais distantes
- **Guerra Total**: URSS revida imediatamente (50% precisão), primeiro a 5 vence
- **Defesa Antimíssil**: URSS decide entre revidar OU interceptar o míssil americano no ar

### Modo "Guerra Total"
- Torre de lançamento para USA E URSS
- URSS lança contra-ataque 3 segundos após disparo americano
- Ambos os mísseis voam simultaneamente
- Condição de vitória: Primeiro a 5 pontos

### Modo "Defesa Antimíssil" (NOVO)
- URSS detecta o lançamento americano e decide:
  - 55% chance: Tentar INTERCEPTAR o míssil americano no ar
  - 45% chance: Contra-atacar (como Guerra Total)
- Interceptação: míssil antimíssil (trajetória cyan pontilhada) mira no míssil americano
- Se os mísseis colidem (raio de 40px), ambos explodem no ar
- URSS ganha ponto por interceptação bem-sucedida OU por atingir a base americana
- Condição de vitória: Primeiro a 5 pontos

### Sistema de Áudio
- Som de lançamento de míssil (Web Audio API)
- Som de explosão nuclear
- Som de alerta para detecção de lançamento
- Música de fundo com batida militar
- Botão "Som ON/OFF" no header

### Feedback Visual
- Trajetórias coloridas: azul (USA), vermelho (USSR), cyan pontilhado (interceptor)
- Animação de cogumelo atômico em qualquer impacto
- Dano por raio de explosão (80 pixels)
- Míssil na plataforma indica ângulo de lançamento
- Linha de mira pontilhada

## Implementado - Dezembro 2025

1. Jogo de artilharia com física de lançamento oblíquo
2. Tema visual completo da Guerra Fria
3. Mapa-múndi real como fundo
4. Torres de lançamento de mísseis (EUA e URSS)
5. Sprites de mísseis detalhados com orientação dinâmica
6. 5 níveis de dificuldade (Fácil, Médio, Difícil, Guerra Total, Defesa Antimíssil)
7. Modo "Guerra Total" com revide soviético imediato
8. Modo "Defesa Antimíssil" com interceptação ou contra-ataque
9. Voo simultâneo de mísseis (USA e USSR)
10. Colisão míssil-a-míssil para interceptação
11. Trajetórias com cores diferenciadas (azul, vermelho, cyan)
12. Animação de cogumelo atômico
13. Sistema de dano por raio de explosão
14. Posições aleatórias de alvos e obstáculos
15. Placar "USA vs CCCP" nos modos competitivos
16. Condição de vitória "Primeiro a 5" em Guerra Total e Antimíssil
17. Layout centralizado com tema escuro
18. Sistema de áudio completo (Web Audio API)
19. Botão de controle de áudio "Som ON/OFF"

## Arquitetura

```
/app
├── backend/
│   ├── server.py          # FastAPI - endpoint /api/calculate_trajectory
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.js         # Roteador
    │   └── pages/
    │       └── Game.jsx   # Toda lógica do jogo (canvas, física, animação, áudio)
    └── package.json
```

## Backlog / Melhorias Futuras

### P2 - Média Prioridade
- [ ] Modo "Sobrevivência" (destruir máximo de alvos antes de ser atingido)
- [ ] Modo multiplayer local
- [ ] Sistema de níveis/progressão

### P3 - Baixa Prioridade
- [ ] Diferentes tipos de mísseis
- [ ] Power-ups e habilidades especiais
- [ ] Cenários adicionais
- [ ] Ranking de pontuação
- [ ] Refatoração do Game.jsx monolítico em componentes menores
