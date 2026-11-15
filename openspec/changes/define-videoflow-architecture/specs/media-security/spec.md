# Segurança de fontes e recursos

## Purpose

Impedir que URLs e ferramentas de mídia sejam usadas para acessar recursos internos ou consumir recursos sem limites.

## ADDED Requirements

### Requirement: Política de fontes
O sistema SHALL aceitar somente URLs HTTP/HTTPS públicas, de até 2048 caracteres, sem credenciais, nas portas 80/443. SHALL rejeitar arquivos locais, protocolos alternativos, playlists e fontes com DRM ou acesso protegido. Allowlist configurada SHALL restringir hosts de entrada e hosts de mídia separadamente.

#### Scenario: Protocolo ou credencial proibida
- **WHEN** a URL contém file:, ftp:, credenciais embutidas ou porta não permitida
- **THEN** recebe 400 INVALID_URL antes de qualquer conexão externa

#### Scenario: Fonte indisponível
- **WHEN** a fonte exige login, DRM ou bloqueia download
- **THEN** recebe 422 SOURCE_UNAVAILABLE com mensagem clara, sem tentativa de contornar a proteção

### Requirement: Bloqueio de destinos não públicos
O sistema SHALL bloquear loopback, redes privadas, link-local, multicast, reservadas, metadados de nuvem e IPv4 mapeado em IPv6 em toda resolução e conexão, incluindo inspeção, worker, miniaturas e URLs derivadas. Resolução contendo qualquer endereço proibido SHALL ser rejeitada.

#### Scenario: DNS misto ou rebinding
- **WHEN** um hostname resolve para endereço público e privado, ou muda para endereço interno antes da conexão
- **THEN** nenhuma conexão ao endereço proibido acontece e a operação termina com SOURCE_BLOCKED

### Requirement: Saída de rede controlada
Ferramentas de mídia SHALL operar sem saída direta à Internet ou acesso aos serviços de dados. Toda conexão externa SHALL passar por gateway com resolução validada e conexão ao IP aprovado. Redirects, manifests, segmentos e sub-recursos SHALL obedecer à mesma política; falha do gateway SHALL bloquear a operação.

#### Scenario: Redirecionamento inseguro
- **WHEN** uma fonte pública redireciona para 169.254.169.254, localhost ou serviço do Compose
- **THEN** o destino é bloqueado sem divulgar dados internos

#### Scenario: Tentativa de ignorar o proxy
- **WHEN** um subprocesso tenta conectar diretamente ao host, banco, Redis ou Internet
- **THEN** o isolamento de rede impede a conexão independentemente da validação da URL

### Requirement: Quotas e limites
O sistema SHALL limitar a 3 trabalhos ativos por contexto, 2 processamentos globais, 100 trabalhos ativos globais, 2 GiB de entrada acumulada, 1 GiB de saída, 2 horas de duração e 30 minutos de execução por tentativa. Criações SHALL reservar quotas atomicamente e retornar 429 ou 503 quando esgotadas.

#### Scenario: Criações simultâneas
- **WHEN** um contexto com 2 trabalhos ativos envia 2 criações concorrentes
- **THEN** no máximo uma é aceita e a outra recebe 429 ACTIVE_LIMIT

### Requirement: Limitação por origem e proteção HTTP
O sistema SHALL aplicar limites compartilhados de 120 leituras/minuto/IP, 10 inspeções/minuto/IP e 10 mutações/minuto/IP, com Retry-After em 429. SHALL confiar apenas no proxy interno, restringir CORS à origem configurada, limitar JSON a 16 KiB e aplicar headers de segurança.

#### Scenario: IP falsificado
- **WHEN** o cliente envia X-Forwarded-For arbitrário
- **THEN** não altera a origem usada pelo limitador nem contorna sua quota

### Requirement: Processos e armazenamento isolados
O sistema SHALL executar ferramentas sem shell, com argumentos estruturados, configuração externa desativada e diretórios por tentativa. SHALL rejeitar symlinks e caminhos fora do volume; esgotamento de espaço SHALL interromper a tentativa e remover seus parciais.

#### Scenario: Nome malicioso
- **WHEN** título ou URL inclui ../, opções de comando ou metacaracteres de shell
- **THEN** nenhum comando adicional executa e nenhum arquivo fora do diretório autorizado é criado ou servido
