# Tarefas — Processamento

## 1. Integração de fila e sandbox

- [x] 1.1 Implementar dispatcher outbox e consumo BullMQ com IDs/gerações validados; testar reenvio, mensagem duplicada e crash entre enqueue e confirmação do outbox.
- [x] 1.2 Implementar spool versionado entre worker e sandbox, escrita atômica, deadlines e heartbeats; testar mensagens inválidas, eventos fora de geração, crash e limpeza dos arquivos de controle.
- [x] 1.3 Implementar supervisor de processos sem shell, grupos, limites de stdout/stderr e diretórios isolados; testar injeção por argumento, timeout e término de processos filhos reais.
- [x] 1.4 Documentar protocolo worker/sandbox e requisitos de rede em docs/media-pipeline.md; verificar o protocolo contra fixtures de mensagens e health checks.

## 2. Inspeção

- [x] 2.1 Integrar yt-dlp real com proxy e opções restritas e normalizar metadados; testar fixture válida, campos ausentes, áudio sem vídeo, playlists, transmissão ao vivo e origem indisponível.
- [x] 2.2 Implementar POST /api/media/inspect com fila curta, limite de 30 segundos e armazenamento por contexto; testar 200, timeout com término do processo, 422 e expiração de 10 minutos.
- [x] 2.3 Implementar obtenção e entrega local de miniatura validada; testar MIME, limite de 2 MiB, destino privado, acesso estrangeiro e inspeção vencida.
- [x] 2.4 Documentar fontes elegíveis, confirmação de direitos e erros de inspeção; validar exemplos e avisos usando respostas reais da fixture.

## 3. Download e conversão

- [x] 3.1 Implementar seleção de variantes, revalidação da fonte e download monitorado via gateway; testar mudança de disponibilidade, bytes sem Content-Length, segmentos e quota acumulada.
- [x] 3.2 Implementar MP4 H.264/AAC/yuv420p/faststart nos três tetos de resolução; verificar com ffprobe outputs reais, remux compatível, redução e ausência de upscale.
- [x] 3.3 Implementar MP3 com bitrate-alvo 96/192/320; verificar codec, bitrate e duração por ffprobe e rejeição explícita de mídia sem áudio.
- [x] 3.4 Implementar progresso por fase e indeterminado, limites de duração/tempo/tamanho/espaço e validação de resultado; testar fonte sem duração, disco insuficiente, arquivo inválido e erro de FFmpeg sem publicação.
- [x] 3.5 Implementar staging/publicação com CAS, checksum e coleta de órfãos; testar crash antes/depois de rename e commit, garantindo um único artefato autorizado.
- [x] 3.6 Documentar seleção, fallback, codecs e limites de qualidade; conferir a documentação com a matriz das seis combinações reais de formato/qualidade.

## 4. Lifecycle e recuperação

- [x] 4.1 Implementar leases e slots globais com fencing por geração; testar dois workers concorrentes, perda de lease e bloqueio de atualizações antigas.
- [x] 4.2 Implementar cancelamento durável e término em até 10 segundos; testar fila, download, conversão, repetição de cancelamento e corrida com conclusão.
- [x] 4.3 Implementar retries transientes e manuais com limites por ciclo/total e idempotência; testar backoff, quota revalidada, erro permanente e concorrência de retries.
- [x] 4.4 Implementar reconciliador de fila ausente e worker interrompido; testar reinício real com recuperação em até 120 segundos após restabelecimento dos serviços e sem duplicar efeitos.
- [x] 4.5 Implementar expiração de arquivos, inspeções, histórico e contextos e limpeza segura de órfãos; testar relógio controlado, bloqueio imediato de download expirado e preservação de leases válidas.
- [x] 4.6 Documentar transições, recuperação e retenção; verificar exemplos contra testes de estado e logs sanitizados.

## 5. Aceitação integrada

- [x] 5.1 Executar matriz de mídia sintética autorizada com yt-dlp/FFmpeg reais no Compose, incluindo seis qualidades, cancelamento, falha, retry, expiração e entrega protegida; registrar versões, comandos e resultados.
- [x] 5.2 Executar lint, formatação, typecheck, testes e build do worker; revisar media-inspection, media-processing e job-lifecycle contra evidências, mantendo pendências abertas.

## Workflow follow-up

- Aplicar depois da base e da infraestrutura mínima; nenhuma integração de produção pode permanecer mockada.
- Sincronizar e arquivar somente após verificação completa.
