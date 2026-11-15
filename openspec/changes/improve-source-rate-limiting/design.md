# Design: Source Rate Limiting

## Context

O VideoFlow executa inspecoes de midia por meio de Fastify,
BullMQ, Redis, PostgreSQL, worker e sandbox.

Durante testes com YouTube, o extrator apresentou HTTP 429
e exigencia de verificacao adicional.

O processamento com outras fontes, incluindo Instagram,
continua funcional.

O objetivo desta mudanca e tratar limitacoes externas sem
enfraquecer a seguranca ou prejudicar outras plataformas.

## Goals / Non-Goals

### Goals

- Classificar limitacoes externas de forma precisa.
- Evitar repeticao de inspecoes durante um cooldown.
- Compartilhar o estado entre instancias da API.
- Preservar o tempo restante em Retry-After.
- Proteger contra rajadas concorrentes.
- Manter fontes independentes.
- Preservar diagnosticos sanitizados.
- Permitir verificacao automatizada.

### Non-Goals

- Remover bloqueios antibot do YouTube.
- Automatizar login em plataformas externas.
- Compartilhar cookies pessoais.
- Contornar DRM ou controles de acesso.
- Substituir BullMQ ou PostgreSQL.
- Modificar o sistema de autenticacao, inexistente no produto.

## Decisions

### D1: Redis como armazenamento do cooldown

Utilizar a conexao ioredis ja existente na API.

Chave inicial:

videoflow:source-cooldown:youtube

A politica inicial usa TTL de 60 segundos.

O prazo e interno ao VideoFlow, nao sendo uma garantia
de liberacao da fonte.

Usar SET com NX e expiracao para impedir que deteccoes
repetidas prolonguem indefinidamente o cooldown.

A chave sera compartilhada pelas variantes de hostname
do YouTube reconhecidas pela politica.

### D2: Classificacao dos erros

O supervisor de processos identifica:

- SOURCE_RATE_LIMITED: HTTP 429 da origem.
- SOURCE_AUTH_REQUIRED: verificacao exigida pela origem.
- NETWORK_ERROR: falha de conectividade.
- PROCESS_FAILED: falha generica do processo.

Quando o diagnostico contiver HTTP 429 e exigencia de
autenticacao, priorizar SOURCE_RATE_LIMITED.

Preservar internamente apenas diagnosticos sanitizados.
Nao retornar stderr bruto do yt-dlp ao visitante.

### D3: Integracao com a API

A API consulta o cooldown depois de validar o contexto
anonimo e a URL, mas antes de persistir uma inspecao.

Se o cooldown estiver ativo:

- Retornar HTTP 429.
- Informar SOURCE_RATE_LIMITED.
- Incluir Retry-After com o tempo restante.
- Nao criar MediaInspection.
- Nao publicar job BullMQ.

Quando uma inspecao retornar SOURCE_RATE_LIMITED,
registrar o cooldown no Redis.

Preservar os contratos das demais rotas.

### D4: Isolamento por fonte

Utilizar identificadores canonicos de plataforma.

youtube.com, seus subdominios reconhecidos e youtu.be
compartilham a politica do YouTube.

Instagram e outras fontes nao recebem o cooldown
originado por uma limitacao do YouTube.

Nao usar correspondencia por substring para identificar
dominios, evitando falsos positivos.

### D5: Controle de concorrencia

O cooldown atual so passa a bloquear novas solicitacoes
depois da primeira falha registrada.

Para evitar rajadas anteriores ao primeiro HTTP 429,
implementar reserva atomica e temporaria no Redis.

A reserva deve:

- Ser compartilhada entre instancias da API.
- Ter expiracao automatica.
- Utilizar identificador unico por proprietario.
- Ser liberada somente pelo proprietario.
- Impedir liberacao indevida de reservas de terceiros.
- Ser mantida durante a inspecao efetiva.
- Liberar recursos tambem em falhas e timeouts.
- Ser testada sob solicitacoes simultaneas.

Usar operacao atomica Redis e liberacao condicional,
por exemplo com script Lua.

Nao utilizar mutex somente em memoria local.

O limite inicial de concorrencia deve ser pequeno e
configuravel, sem alterar a concorrencia global existente
do worker sem justificativa.

### D6: Indisponibilidade do Redis

Se a verificacao obrigatoria do cooldown falhar,
a API retorna HTTP 503.

Nao executar nova inspecao da fonte protegida enquanto
nao for possivel verificar a restricao.

Preservar o tratamento existente de indisponibilidade
do rate limiter e das filas.

### D7: Retry-After

Quando o cooldown estiver ativo, utilizar o TTL restante
em segundos, arredondado para cima.

O error handler global nao deve substituir um Retry-After
ja definido.

Para o rate limiter interno, preservar o comportamento
atual de 60 segundos.

### D8: Compatibilidade do extrator

Manter:

- yt-dlp 2026.10.26.
- Dependencias padrao do yt-dlp, incluindo EJS.
- Runtime JavaScript Node.js.
- FFmpeg.
- Gateway de saida.
- Sandbox sem acesso externo direto.

Essas dependencias melhoram a compatibilidade, mas nao
garantem acesso a fontes que exijam verificacao.

## Data Flow

1. Navegador envia POST /api/media/inspect.
2. Fastify valida origem, contexto e URL.
3. API consulta o cooldown da plataforma.
4. API adquire uma reserva concorrente, quando aplicavel.
5. API cria a inspecao no PostgreSQL.
6. BullMQ publica o trabalho.
7. Worker solicita execucao ao sandbox.
8. yt-dlp utiliza o gateway de saida.
9. Worker persiste o resultado.
10. API classifica o erro ou retorna metadados.
11. Quando existir HTTP 429 externo, ativa o cooldown.
12. A reserva concorrente e liberada com seguranca.

## Testing Strategy

### Unit Tests

- Ativacao de cooldown.
- Compartilhamento entre dominios equivalentes.
- Isolamento entre fontes.
- Calculo de TTL.
- Expiracao.
- Falha de Redis.
- Classificacao de erros 429 e autenticacao.

### Integration Tests

Utilizar PostgreSQL e Redis de regressao.

Validar:

- HTTP 429 durante cooldown.
- Retry-After decrescente.
- Ausencia de MediaInspection durante bloqueio.
- Ausencia de publicacao BullMQ durante bloqueio.
- Fonte independente nao bloqueada.
- Liberacao apos expiracao.
- Reservas atomicas sob concorrencia.
- Recuperacao apos timeout.
- Preservacao dos contratos existentes.

Nao depender de requisicoes reais ao YouTube nos
testes automatizados.

### Operational Verification

- Typecheck.
- ESLint.
- Prettier.
- Build.
- Regressao automatizada.
- Testes de media.
- Validacao estrita OpenSpec.
- Verificacao das configuracoes Docker.
- Teste manual de HTTP 429 e Retry-After.

## Risks / Trade-offs

### Cooldown curto

Sessenta segundos podem ser insuficientes para uma
restricao externa prolongada.

O sistema deve permitir evoluir a politica sem
modificar os contratos HTTP.

### Redis compartilhado

Uma falha no Redis pode impedir temporariamente
inspecoes protegidas.

Essa escolha prioriza seguranca e previsibilidade.

### Concorrencia

Reservas distribuidas aumentam a complexidade.
Sao necessarias para evitar rajadas entre instancias.

### Observabilidade

Diagnosticos brutos podem conter informacoes sensiveis.
Somente codigos e metadados sanitizados devem ser
persistidos e expostos.

## Implementation Status

Ja implementado e parcialmente validado:

- SOURCE_RATE_LIMITED.
- SOURCE_AUTH_REQUIRED.
- Cooldown Redis por fonte.
- Integracao Fastify.
- Retry-After.
- EJS e Node.js no extrator.
- Seis testes unitarios do cooldown.
- Verificacao manual do bloqueio HTTP 429.
- Verificacao manual da expiracao Redis.

Pendente de verificacao ou implementacao:

- Concorrencia distribuida.
- Testes automatizados da API com cooldown.
- Testes de regressao dos novos codigos do supervisor.
- Verificacao automatizada de Retry-After decrescente.
- Regressao integrada completa apos as modificacoes.
- Reconciliacao final com as outras mudancas OpenSpec.

## Rollback

Preservar backups dos arquivos modificados.

Nao excluir volumes PostgreSQL ou Redis.

Uma reversao deve restaurar o codigo anterior de forma
consistente, reconstruir as imagens afetadas e executar
novamente os testes.

A reversao nao deve remover garantias existentes de
isolamento, controle de acesso ou limite de recursos.