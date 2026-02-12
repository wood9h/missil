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

### Design e Tema
- Tema da Guerra Fria (EUA vs União Soviética)
- Mapa-múndi real como fundo
- Torres de lançamento de mísseis detalhadas
- Sprites de mísseis orientados pela trajetória
- **Layout centralizado com tema escuro imersivo** ✅

### Níveis de Dificuldade
- **Fácil**: Obstáculos menores, alvos mais próximos
- **Médio**: Configuração padrão
- **Difícil**: Obstáculos maiores, alvos mais distantes
- **Guerra Total**: URSS revida imediatamente (50% precisão)

### Modo "Guerra Total"
- URSS lança contra-ataque 3 segundos após disparo americano
- Ambos os mísseis voam simultaneamente na tela ✅
- Míssil USA = trajetória azul, Míssil USSR = trajetória vermelha ✅
- Placar "USA vs CCCP" substituí estatísticas normais ✅

### Sistema de Áudio ✅
- **Som de lançamento de míssil**: Efeito de foguete sintetizado (Web Audio API)
- **Som de explosão nuclear**: Boom profundo com ruído
- **Som de alerta**: Sirene quando URSS detecta lançamento
- **Música de fundo**: Batida de tambor militar em loop
- **Botão de mudo/som**: Controle de áudio no header

### Feedback Visual
- Trajetórias coloridas (azul = USA, vermelho = USSR)
- Sprite de míssil orienta-se tangencialmente à trajetória
- Animação de cogumelo atômico em qualquer impacto
- Dano por raio de explosão (80 pixels)

## O Que Foi Implementado

### Data: Dezembro 2025

**Funcionalidades Completas:**
1. ✅ Jogo de artilharia com física de lançamento oblíquo
2. ✅ Tema visual completo da Guerra Fria
3. ✅ Mapa-múndi real como fundo
4. ✅ Torres de lançamento de mísseis (EUA e URSS)
5. ✅ Sprites de mísseis detalhados com orientação dinâmica
6. ✅ 4 níveis de dificuldade (Fácil, Médio, Difícil, Guerra Total)
7. ✅ Modo "Guerra Total" com revide soviético imediato
8. ✅ Voo simultâneo de mísseis (USA e USSR)
9. ✅ Trajetórias com cores diferenciadas
10. ✅ Animação de cogumelo atômico
11. ✅ Sistema de dano por raio de explosão
12. ✅ Aleatoriedade na posição de alvos e obstáculos
13. ✅ Placar "USA vs CCCP" no modo Guerra Total
14. ✅ **Layout centralizado com tema escuro**
15. ✅ **Sistema de áudio com Web Audio API**
16. ✅ **Sons de lançamento de míssil (USA e USSR diferentes)**
17. ✅ **Som de explosão nuclear**
18. ✅ **Sirene de alerta para revide soviético**
19. ✅ **Música de fundo com batida militar**
20. ✅ **Botão de controle de áudio**

**Correção de Bug Crítico (Dezembro 2025):**
- Problema: Míssil americano desaparecia quando míssil soviético era lançado
- Solução: Sistema unificado de gerenciamento de projéteis (`projectilesRef`) com loop de animação único (`runGameLoop`)
- Status: ✅ Verificado e funcionando

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

### P1 - Alta Prioridade
- [ ] Aumentar variação de posição do alvo após acertos (se necessário)

### P2 - Média Prioridade
- [ ] Modo multiplayer local
- [ ] Sistema de níveis/progressão
- [ ] Ranking de pontuação

### P3 - Baixa Prioridade
- [ ] Diferentes tipos de mísseis
- [ ] Power-ups e habilidades especiais
- [ ] Cenários adicionais
