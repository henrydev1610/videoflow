# Proposta — Processamento de mídia

## Why

O VideoFlow precisa produzir arquivos reais e recuperar trabalhos interrompidos sem duplicar processamento ou expor mídia entre visitantes. Esta mudança implementa o ciclo assíncrono sobre os contratos da fundação.

## What Changes

- Consultar metadados e formatos de fontes autorizadas com yt-dlp.
- Processar MP4 e MP3 com BullMQ, Redis, yt-dlp e FFmpeg.
- Persistir tentativas, progresso, cancelamento, recuperação e expiração.
- Aplicar isolamento de processos e rede, quotas e limpeza de temporários.
- Validar conversão real usando mídia sintética autorizada, sem depender do YouTube nos testes.

## Capabilities

### New Capabilities

- `media-inspection`: consulta segura de metadados e disponibilidade.
- `media-processing`: seleção de formatos, conversão e publicação atômica de arquivos.
- `job-lifecycle`: estados, tentativas, recuperação, cancelamento e retenção.

### Modified Capabilities

Nenhuma.

## Impact

Cria `workers/media-worker` e adaptadores de inspeção, fila e armazenamento. Depende de `define-videoflow-architecture`; o teste de aceitação exige a rede restrita e os volumes de `operate-videoflow-docker`. Não haverá mocks no caminho de produção, bypass de DRM ou importação de cookies de terceiros.
