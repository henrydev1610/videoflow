# Pipeline de mídia

Implementação em workers/media-worker. O aceite é controlado por openspec/changes/implement-media-processing/tasks.md; existência de código não comprova execução real.

## Fronteiras

API e worker acessam PostgreSQL/Redis na rede de dados. O sandbox recebe apenas comandos de arquivos, sem credenciais do banco, e monta commands somente leitura. A rede media é interna com gateway_mode_ipv4=isolated. Apenas o gateway participa também da rede de saída. O gateway resolve todos os endereços, rejeita qualquer destino não público e conecta ao endereço aprovado sem segunda consulta DNS. HTTPS usa CONNECT, mantendo a validação TLS na ferramenta. A composição de teste tem exceção exclusivamente para http://fixture:80; o entrypoint de produção não lê essa exceção.

## Spool versão 1

Arquivos `<operationId>.command.json`, `.control.json` e `.result.json`. UUIDs e geração positiva são obrigatórios. Cada mensagem contém version, operationId, jobId, attemptId e generation. Comando acrescenta operation (inspect/process), url, format, quality e deadline. Controle contém leaseUntil e cancel. Resultado contém state, progress (0–99), indeterminate, code seguro e metadados permitidos. Schemas estritos em protocol.ts; nenhuma mensagem fornece um executável, argumento arbitrário ou caminho de saída.

Escrita em arquivo exclusivo temporário, fsync e rename. Leitura limitada a 2 MiB, sem seguir symlink. Consumidor ignora resultados de outra identidade/geração. Sandbox verifica controle a cada 500 ms e aborta na ausência de lease válida, cancelamento ou deadline. Processo inicia sem shell em grupo Linux; SIGTERM é seguido por SIGKILL após 5 segundos. stdout e stderr têm limites de 2 MiB e 64 KiB, sem exposição das saídas brutas ao visitante.

Worker confirma resultado terminal antes de remover mensagens. Se não confirmar o encerramento, preserva lease/diretório até reconciliação; não considera timeout de comunicação prova de término do processo. Heartbeats de saúde ficam em /tmp, separados das mensagens de domínio.

## Fila e dados

Outbox persistida na transação de criação. Dispatcher adiciona BullMQ antes de marcar deliveredAt. ID de fila deriva de job UUID e geração; aquisição persistente impede duplicação mesmo após remoção do ID no Redis. Duas execuções globais, com bloqueio transacional de aquisição, e duas inspeções em fila separada. A fila carrega IDs e geração; dados da fonte são relidos do banco.

Publicação copia saída derivada da identidade para staging, calcula SHA-256, faz rename no volume final e CAS com registro FileArtifact. Apenas COMPLETED autoriza streaming. Órfão de falha entre filesystem e commit não é servido. Históricos de tentativa são preservados. As janelas staged, renamed, committed e cancelamento foram verificadas com banco/filesystem reais em tests/publication.integration.test.ts.

## Ferramentas e opções

yt-dlp usa proxy explícito, ignore-config, no-playlist, sem cookies importados, retries internos desativados e argumentos estruturados. FFmpeg converte arquivos locais com protocolos file/pipe. MP4 usa H.264/AAC/yuv420p, faststart e alturas máximas 360/720/1080, sem upscale. Remux somente quando codec, formato de pixel e altura são compatíveis. MP3 usa alvos 96/192/320 kbps; isso não melhora uma fonte inferior. ffprobe verifica a saída antes da publicação.

Mídia protegida, playlists, lives e duração superior a 2 horas são rejeitadas. A confirmação de direitos permanece obrigatória na criação da API. Somente mídia própria ou autorizada deve ser enviada. Miniaturas passam pelo mesmo proxy, têm limite de 2 MiB e validação de MIME/assinatura PNG, JPEG ou WebP; SVG não é aceito.

## Execução local de teste

## Matriz real observada em 15/11/2026

Fonte sintética de 4 segundos, 854x480, H.264/AAC. Verificada pelo worker, gateway e sandbox reais; ffprobe confirmou codecs, resolução e bitrates. MP4 médio/alto satisfaz o caminho de remux; baixo exige redução. Auditoria binária confirmou moov antes de mdat nos três MP4.

| Formato | Qualidade | Resultado | Bytes |
|---|---|---|---|
| MP3 | low | MP3, 96 kbps | 49049 |
| MP3 | medium | MP3, 192 kbps | 97949 |
| MP3 | high | MP3, 320 kbps | 163151 |
| MP4 | low | H.264/AAC, yuv420p, altura <=360, faststart | 302640 |
| MP4 | medium | H.264/AAC, yuv420p, altura 480, faststart | 626478 |
| MP4 | high | H.264/AAC, yuv420p, altura 480, faststart | 626478 |

Quando yt-dlp não fornece codecs (por exemplo, uma URL direta genérica), a inspeção usa download local limitado e ffprobe para descobrir as faixas. Não infere presença de áudio pela extensão. A operação continua submetida ao deadline de inspeção; fontes lentas/grandes podem não caber nesse prazo. Metadados desconhecidos permanecem null até que sejam medidos. A qualidade solicitada é um teto/alvo e não melhora a fonte.

## Comandos

## Lifecycle, recuperação e retenção

Aquisição passa PENDING para DOWNLOADING com lease de 30 segundos. O consumidor renova a lease a cada cinco segundos, conforme o design. Atualizações e publicação exigem geração, proprietário e lease válida. PROCESSING começa após validação da entrada; apenas o commit da publicação marca COMPLETED/100. Cancelamento terminal vence por CAS e não pode ser revertido por evento atrasado.

NETWORK_ERROR, PROCESS_TIMEOUT, WORKER_INTERRUPTED, SANDBOX_UNAVAILABLE e STATE_UNAVAILABLE admitem até três tentativas por ciclo, com esperas de 5 e 20 segundos. Falha permanente não gera retry automático. Retry manual mantém o identificador, revalida quotas e cria nova geração/ciclo, limitado a nove tentativas totais. A reconciliadora roda a cada 30 segundos sob lock PostgreSQL; lease vencida permanece ocupando slot durante a margem de encerramento de 10 segundos. O teste de SIGKILL real recuperou o trabalho 0059abd6-3bae-497a-9cd4-b25a1a75a4c3 em 71.637 ms, com tentativa interrompida e geração seguinte concluída.

Arquivo expira após 24 horas; a API bloqueia acesso pelo relógio independentemente da varredura de cinco minutos. Histórico segue o prazo persistido de contexto/30 dias. Inspeções e miniaturas expiram em dez minutos. Remoção de arquivos antecede a de registros; falha de filesystem preserva o registro para nova tentativa. Órfãos temporários e controles com mais de 15 minutos só são removidos sem lease/inspeção válida. Testes de retenção usam datas controladas e comprovam preservação de diretório com lease ativa.

## Respostas reais de inspeção

A fixture video.mp4 retornou HTTP 200, duração aproximada de quatro segundos e formatos mp4/mp3. audio.mp3 retornou apenas mp3; silent.mp4 apenas mp4 e aviso NO_AUDIO. A página com poster retornou URL local de miniatura PNG, bloqueada com 404 para outro contexto e 410 após expiração. Fonte protegida retornou 422 SOURCE_UNAVAILABLE; a fixture lenta retornou 504 INSPECTION_TIMEOUT após encerramento por prazo. Ausência de metadados é representada por null; não é preenchida com valores fabricados. Confirmação de direitos é exigida na criação, sem mecanismos para contornar login ou DRM.

Progresso do download interpreta bytes e total, com marcador numérico restrito e atualização máxima por segundo; total ausente mantém indicação indeterminada. A matriz adicional comprovou entrada HTTP sem Content-Length e manifest HLS com segmentos pelo mesmo gateway. O teste de quota do gateway usa um limite reduzido para demonstrar soma entre conexões, sem transferir 2 GiB em cada execução de teste.

`docker build -f infra/docker/media.Dockerfile -t videoflow-media:development .`

`docker compose -f compose.media.yaml -f compose.media.fixture.yaml up -d fixture worker`

`docker compose -f compose.media.yaml -f compose.media.fixture.yaml run --rm quality`

O override de fixture monta fontes de teste somente leitura para iteração; não é composição final de produção. A fixture é vídeo/som sintético gerado por FFmpeg. Volumes são exclusivos do projeto videoflow-media-test e não devem ser apagados. Não há porta publicada nem deploy remoto. Os resultados executados serão registrados em docs/verification; estes comandos documentados não são evidência de aprovação por si só.
