# Conversão de mídia

## Purpose

Gerar arquivos MP4 e MP3 compatíveis a partir de mídia autorizada respeitando características da fonte e limites operacionais.

## ADDED Requirements

### Requirement: Saída MP4 compatível
O sistema SHALL produzir MP4 com vídeo H.264, áudio AAC quando presente, pixel format yuv420p e faststart. Qualidades baixa, média e alta SHALL limitar altura a 360, 720 e 1080 pixels, preservando proporção e nunca ampliando a resolução da fonte.

#### Scenario: Fonte inferior ao limite
- **WHEN** um vídeo 480p é solicitado em qualidade alta
- **THEN** o resultado mantém altura no máximo 480p e comunica que a qualidade é limitada pela fonte

#### Scenario: Ausência de variante menor
- **WHEN** somente variante acima do limite está disponível e cabe nas quotas
- **THEN** converte reduzindo a resolução ao limite selecionado

### Requirement: Saída MP3 honesta
O sistema SHALL produzir MP3 com bitrate-alvo de 96, 192 ou 320 kbps para baixa, média ou alta. SHALL explicar que bitrate-alvo não representa aumento da qualidade da fonte e rejeitar mídia sem áudio com FORMAT_UNAVAILABLE.

#### Scenario: Áudio de baixa qualidade
- **WHEN** uma fonte de 64 kbps é solicitada em alta
- **THEN** o arquivo usa o alvo selecionado sem descrever a conversão como melhoria da fonte

### Requirement: Seleção e revalidação
O sistema SHALL selecionar a melhor variante compatível até o teto pedido, preferir remux quando tecnicamente compatível e converter quando necessário. SHALL revalidar fonte, segurança e disponibilidade no processamento, pois metadados podem mudar após inspeção.

#### Scenario: Fonte alterada
- **WHEN** a mídia deixa de oferecer áudio entre inspeção e processamento MP3
- **THEN** o trabalho falha com FORMAT_UNAVAILABLE sem publicar um arquivo vazio

### Requirement: Publicação íntegra
Um arquivo SHALL tornar-se disponível somente após saída bem-sucedida, validação de codecs, duração e tamanho, e publicação atômica. Progresso SHALL permanecer entre 0 e 99 durante execução e alcançar 100 somente em COMPLETED; total desconhecido SHALL gerar indicador indeterminado.

#### Scenario: Falha de conversão
- **WHEN** FFmpeg termina com erro ou produz arquivo inválido
- **THEN** nenhum artefato é disponibilizado, a tentativa registra erro seguro e os arquivos parciais são removidos

### Requirement: Limites durante execução
O processamento SHALL monitorar duração, bytes acumulados, saída, espaço e tempo real mesmo quando a fonte omitir metadados ou Content-Length. SHALL encerrar a árvore de processos ao exceder qualquer limite e liberar a reserva da tentativa.

#### Scenario: Fluxo ilimitado
- **WHEN** uma resposta sem tamanho declarado excede o limite de entrada
- **THEN** a transferência é interrompida com INPUT_LIMIT e não publica artefato
