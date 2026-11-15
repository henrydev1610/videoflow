# Inspeção de mídia

## Purpose

Consultar metadados e opções de uma mídia autorizada antes de iniciar processamento e comunicar indisponibilidades com clareza.

## ADDED Requirements

### Requirement: Consulta de metadados
POST /api/media/inspect SHALL receber {url} e retornar 200 com inspectionId, expiresAt, title, durationSeconds, thumbnailUrl, source, availableFormats e warnings. Campos ausentes SHALL ser null; duração desconhecida SHALL ser limitada durante o processamento. A inspeção SHALL expirar em 10 minutos e ter timeout de 30 segundos.

#### Scenario: Metadados parciais
- **WHEN** uma fonte válida não informa duração nem miniatura
- **THEN** a inspeção retorna esses campos como null e informa as opções efetivamente disponíveis

#### Scenario: Origem lenta
- **WHEN** a consulta não termina em 30 segundos
- **THEN** o subprocesso é encerrado e a API retorna 504 INSPECTION_TIMEOUT

### Requirement: Disponibilidade honesta
O sistema SHALL informar se existe áudio ou vídeo aproveitável, sem prometer opções indisponíveis. SHALL rejeitar playlists, transmissões ao vivo, mídia acima de 2 horas e conteúdo protegido com 422 e código específico. A confirmação de direitos SHALL ser exigida antes da criação.

#### Scenario: Fonte somente áudio
- **WHEN** a inspeção encontra somente áudio
- **THEN** oferece MP3 e informa que MP4 não está disponível

#### Scenario: Conteúdo protegido
- **WHEN** a ferramenta informa DRM, autenticação obrigatória ou bloqueio da fonte
- **THEN** retorna SOURCE_UNAVAILABLE sem importar cookies, credenciais ou mecanismos de bypass

### Requirement: Miniaturas seguras
Miniaturas SHALL ser servidas por rota local autorizada /api/media/inspections/:id/thumbnail, após validação de rede, MIME de imagem permitido e limite de 2 MiB. O navegador SHALL nunca carregar URLs arbitrárias da origem diretamente.

#### Scenario: Miniatura maliciosa
- **WHEN** a URL da miniatura aponta para rede interna, SVG ativo ou arquivo maior que 2 MiB
- **THEN** a miniatura é omitida com aviso e nenhum recurso inseguro chega ao navegador
