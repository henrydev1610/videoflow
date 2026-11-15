# Source Rate Limiting Specification

## ADDED Requirements

### Requirement: Classificacao de limitacoes externas

O VideoFlow SHALL identificar limitacoes HTTP 429 reportadas por fontes externas e diferenciá-las de erros de autenticacao, rede e processamento.

#### Scenario: Origem retorna HTTP 429
- WHEN o extrator identifica HTTP 429 na resposta da origem
- THEN o sistema SHALL classificar a falha como SOURCE_RATE_LIMITED
- AND a API SHALL responder HTTP 429

#### Scenario: Origem exige autenticacao
- WHEN a origem exige verificacao de usuario sem indicar HTTP 429
- THEN o sistema SHALL classificar a falha como SOURCE_AUTH_REQUIRED
- AND a API SHALL responder HTTP 422

#### Scenario: Limitacao e autenticacao simultaneas
- WHEN o diagnostico contem HTTP 429 e exigencia de autenticacao
- THEN o sistema SHALL priorizar SOURCE_RATE_LIMITED
- AND o diagnostico interno SHALL preservar a distincao entre as duas condicoes

### Requirement: Cooldown compartilhado por fonte

O VideoFlow SHALL registrar limitacoes temporarias em armazenamento compartilhado com expiracao automatica.

#### Scenario: Ativacao do cooldown
- WHEN uma inspecao do YouTube termina com SOURCE_RATE_LIMITED
- THEN o sistema SHALL registrar um cooldown compartilhado no Redis
- AND novas inspecoes dessa fonte SHALL respeitar o cooldown

#### Scenario: Links equivalentes do YouTube
- WHEN o cooldown do youtube.com estiver ativo
- THEN solicitacoes para www.youtube.com e youtu.be SHALL compartilhar a mesma restricao

#### Scenario: Expiracao
- WHEN o prazo do cooldown terminar
- THEN o sistema SHALL permitir uma nova tentativa controlada
- AND a expiracao SHALL ocorrer automaticamente

#### Scenario: Ativacao repetida
- WHEN um cooldown ja estiver ativo
- THEN novas falhas SHALL NOT prolongar indefinidamente sua expiracao

### Requirement: Bloqueio antecipado de inspecoes

O VideoFlow SHALL consultar o cooldown antes de criar trabalhos de inspecao.

#### Scenario: Cooldown ativo
- WHEN um visitante solicita a inspecao de uma fonte em cooldown
- THEN a API SHALL responder HTTP 429
- AND SHALL NOT criar um novo registro MediaInspection
- AND SHALL NOT publicar um novo job BullMQ

#### Scenario: Fonte liberada
- WHEN nao existir cooldown ativo para a fonte
- THEN a API SHALL permitir o fluxo normal de inspecao
- AND SHALL manter as demais validacoes de seguranca

#### Scenario: Reserva de inspecao ocupada
- WHEN uma fonte protegida possuir uma reserva de inspecao ativa
- AND outra solicitacao tentar inspecionar a mesma fonte
- THEN a API SHALL responder HTTP 429 com codigo SOURCE_BUSY
- AND a resposta SHALL incluir Retry-After com o prazo restante da reserva
- AND o sistema SHALL NOT criar um novo registro MediaInspection
- AND SHALL NOT publicar um novo job BullMQ
### Requirement: Isolamento entre fontes

O VideoFlow SHALL aplicar restricoes somente as fontes correspondentes.

#### Scenario: YouTube limitado
- WHEN o YouTube estiver em cooldown
- THEN as inspecoes de fontes independentes, como Instagram, SHALL NOT ser bloqueadas por essa restricao

### Requirement: Retry-After

O VideoFlow SHALL informar o tempo restante de uma limitacao temporaria.

#### Scenario: Cooldown ativo
- WHEN a API retornar SOURCE_RATE_LIMITED durante um cooldown
- THEN a resposta SHALL incluir Retry-After
- AND o valor SHALL corresponder ao tempo restante em segundos, arredondado para cima

#### Scenario: Rate limit interno
- WHEN o rate limiter do proprio VideoFlow retornar RATE_LIMITED
- THEN o comportamento do limite interno SHALL permanecer independente do cooldown de fontes externas

### Requirement: Falhas do Redis

O VideoFlow SHALL tratar indisponibilidade do armazenamento de cooldown de forma segura.

#### Scenario: Redis indisponivel
- WHEN a consulta obrigatoria do cooldown falhar
- THEN a API SHALL responder HTTP 503
- AND SHALL NOT iniciar uma nova inspecao para a fonte protegida

### Requirement: Controle de concorrencia

O VideoFlow SHALL limitar inspecoes simultaneas de uma mesma fonte para evitar rajadas durante a deteccao de limitacoes externas.

#### Scenario: Inspecoes simultaneas
- WHEN varias inspecoes da mesma fonte forem solicitadas simultaneamente
- THEN o sistema SHALL aplicar um limite compartilhado de concorrencia
- AND SHALL evitar que a liberacao de um cooldown produza uma rajada descontrolada

### Requirement: Diagnosticos seguros

O VideoFlow SHALL registrar codigos tecnicos de falha sem expor dados confidenciais.

#### Scenario: Falha na origem
- WHEN uma inspeção falhar
- THEN o sistema SHALL registrar o codigo tecnico sanitizado
- AND SHALL NOT expor cookies, tokens, credenciais ou diagnosticos brutos na resposta publica

### Requirement: Compatibilidade do processamento

O VideoFlow SHALL manter as dependencias necessarias ao processamento autorizado de midias.

#### Scenario: Extrator JavaScript
- WHEN o worker executar o extrator com suporte JavaScript habilitado
- THEN as dependencias de runtime SHALL estar disponiveis no sandbox
- AND o gateway e as restricoes de rede SHALL permanecer ativos

#### Scenario: Restricao da plataforma
- WHEN a origem exigir verificacao ou negar acesso
- THEN o sistema SHALL respeitar a restricao
- AND SHALL NOT utilizar mecanismos de contorno de autenticacao ou protecoes tecnicas