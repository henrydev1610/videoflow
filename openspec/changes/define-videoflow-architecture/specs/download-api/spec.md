# Contratos de downloads

## Purpose

Definir contratos públicos verificáveis para criar, consultar e operar solicitações de mídia no contexto anônimo autorizado.

## ADDED Requirements

### Requirement: Validação e erros consistentes
A API SHALL validar entradas e saídas, publicar OpenAPI em /api/openapi.json e retornar erros como {error:{code,message,requestId,details?}} sem stack, caminhos internos ou segredos. IDs SHALL ser UUID; datas SHALL usar ISO 8601 UTC.

#### Scenario: Entrada inválida
- **WHEN** uma criação envia formato diferente de mp3 ou mp4, qualidade desconhecida ou campo extra
- **THEN** recebe 400 VALIDATION_ERROR com detalhes de campos seguros, sem criar trabalho

### Requirement: Criação idempotente
POST /api/downloads SHALL receber {inspectionId,format,quality,rightsConfirmed:true}, exigir Idempotency-Key UUID e responder 202 com o trabalho persistido PENDING. Inspeção SHALL pertencer ao contexto e ter validade de 10 minutos. Reuso da chave com outro corpo SHALL retornar 409.

#### Scenario: Reenvio após perda de conexão
- **WHEN** o visitante repete a mesma chave e corpo dentro da retenção do trabalho
- **THEN** recebe o mesmo ID sem criar trabalho ou reserva adicional

#### Scenario: Inspeção vencida
- **WHEN** o visitante inicia um trabalho com inspeção vencida
- **THEN** recebe 409 INSPECTION_EXPIRED e precisa consultar a mídia novamente

### Requirement: Consulta e indicadores restritos
GET /api/downloads SHALL aceitar page >= 1, pageSize de 1 a 100 (padrão 20), q de até 100 caracteres, status, format e sort em createdAt:asc, createdAt:desc ou title:asc. SHALL retornar items,total,page,pageSize e summary do contexto completo, independente dos filtros.

#### Scenario: Histórico paginado
- **WHEN** o visitante filtra por FAILED e solicita a segunda página
- **THEN** recebe somente seus itens correspondentes, ordenação estável com ID como desempate e total filtrado

#### Scenario: Indicadores completos
- **WHEN** uma página contém 20 itens de um contexto com 30 trabalhos
- **THEN** summary apresenta total, completed, active, failed, cancelled e expired dos 30 trabalhos

### Requirement: Detalhes e ações
GET /api/downloads/:id SHALL retornar o trabalho com tentativas e expirações. POST /api/downloads/:id/cancel SHALL responder 202 ao solicitar cancelamento ativo; POST /api/downloads/:id/retry SHALL responder 202 ao criar nova tentativa de FAILED elegível. Estados incompatíveis SHALL resultar em 409.

#### Scenario: Repetição de concluído
- **WHEN** o visitante tenta repetir um trabalho COMPLETED
- **THEN** recebe 409 INVALID_STATE sem alterar arquivo, tentativas ou estado

### Requirement: Entrega segura de arquivos
GET /api/downloads/:id/file SHALL servir apenas artefatos COMPLETED existentes e não expirados, com autorização por contexto, Content-Disposition attachment e MIME correto. SHALL aceitar uma faixa HTTP válida (206), rejeitar faixa inválida (416) e nunca usar caminhos fornecidos pelo cliente.

#### Scenario: Arquivo expirado
- **WHEN** o proprietário solicita um arquivo após expiresAt
- **THEN** recebe 410 FILE_EXPIRED mesmo antes da execução da limpeza periódica

#### Scenario: Arquivo ainda indisponível
- **WHEN** o proprietário solicita arquivo de um trabalho ativo
- **THEN** recebe 409 FILE_NOT_READY sem conteúdo parcial

### Requirement: Persistência e saúde
O sistema SHALL persistir trabalhos, tentativas, metadados e expirações sem binários no banco. GET /api/health SHALL retornar 200 quando banco e fila estiverem disponíveis ou 503 quando indisponíveis, sem divulgar detalhes privados.

#### Scenario: Reinício da API
- **WHEN** a API reinicia após a criação confirmada de um trabalho
- **THEN** o mesmo contexto continua consultando o trabalho e suas tentativas
