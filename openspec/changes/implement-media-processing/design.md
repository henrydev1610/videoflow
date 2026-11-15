# Design — Pipeline de mídia

## Context

Não existe worker ou pipeline no repositório. A fundação define contratos, contexto, quotas, dados e gateway; consultar `../define-videoflow-architecture/design.md`. A motivação está em proposal.md. Os requisitos estão em media-inspection, media-processing e job-lifecycle.

## Goals / Non-Goals

**Objetivos:** processamento real com efeitos idempotentes, progresso honesto, encerramento de processos e recuperação persistente.

**Fora do escopo:** playlists, transmissões ao vivo, DRM, login de terceiros, cookies importados, downloads privados, melhoria artificial de qualidade ou promessa de entrega exatamente uma vez pela fila.

## Decisions

### Componentes e ordem

API agenda inspeção curta em fila dedicada e espera no máximo 30 segundos, cancelando trabalho de inspeção ao exceder prazo. Worker usa concorrência de inspeção separada e limitada a 2, sem ocupar slots de conversão. BullMQ carrega apenas IDs e geração; worker relê dados do PostgreSQL e valida contratos. Sandbox executa ferramentas, isolado conforme design da fundação. Jobs de mídia têm concorrência global 2 com leases persistidas e fila configurada para o mesmo teto; um reconciliador único via lock consultivo do PostgreSQL verifica inconsistências a cada 30 segundos.

Implementar infraestrutura mínima de `operate-videoflow-docker` antes de validar rede ou processos. O serviço auxiliar é uma fronteira de segurança, não uma alternativa de produção com mocks.

### Inspeção e seleção

yt-dlp recebe spawn sem shell, `--ignore-config`, `--no-playlist`, `--skip-download`, JSON único, proxy explícito, timeout e retries limitados. Limitar stdout JSON a 2 MiB e stderr capturado a 64 KiB. Resolver identificadores de formatos apenas no servidor. Metadados vêm de campos permitidos, nunca cópia livre do JSON externo; null representa desconhecido. Persistir inspeção por 10 minutos e miniatura validada por mesmo prazo, servida pela API com contexto.

MP4: preferir melhor variante <= teto e áudio compatível; se só houver variante maior, baixar dentro do limite e reduzir. Preservar proporção e arredondar dimensões para valores pares sem aumentar a altura original; H.264/AAC/yuv420p e faststart. Remux somente se codecs, resolução e pixel format forem compatíveis; caso contrário transcodificar. Vídeo sem áudio continua válido como MP4 silencioso com aviso. MP3 exige faixa de áudio e usa libmp3lame com bitrate-alvo 96/192/320; a UI explica a limitação da fonte. Fonte sem duração informada é medida e limitada ao longo da execução. ffprobe valida resultado; falha não publica artefato.

yt-dlp baixa mídia e segmentos via gateway; desativar downloads externos desnecessários (legendas, comentários, playlists). FFmpeg converte arquivos já locais com protocolos restritos; nunca recebe URL do cliente. Rede, bytes e tamanho são monitorados também durante download de fluxos sem Content-Length. Limite de entrada soma arquivos/segmentos da tentativa, não apenas o arquivo final.

### Spool e processos

`media-commands` contém solicitações versionadas escritas atomicamente pelo worker: operationId, jobId, attemptId, generation, operation, URL validada e opções enumeradas. Sandbox monta commands somente leitura; `media-results` contém eventos e respostas escritos atomicamente e é validado pelo worker. Diretório `media-temp/<jobId>/<generation>` contém todos os arquivos de tentativa. Worker não aceita caminhos retornados livremente: deriva nomes e valida contenção real.

Cancelamentos são marcadores de controle separados no spool, observados a cada segundo. Sandbox inicia cada processo em grupo próprio, manda SIGTERM e após 5 segundos SIGKILL no grupo, aguarda saída e limpa parciais. Prazo externo de cancelamento 10 segundos. SIGTERM do container executa o mesmo fechamento. Cada pedido tem deadline e lease renovada; sandbox encerra pedidos com lease expirada, inclusive quando o worker desaparece. Reconciliação só inicia nova geração após confirmar término ou superar prazo máximo de encerramento da antiga. Eventos de geração antiga são ignorados. Spool não recebe dados do visitante diretamente e é limpo após confirmação do consumidor.

### Estado, leases e concorrência

Adquirir execução por compare-and-set transacional: status elegível, geração esperada, lease anterior expirada e slot global disponível. Heartbeat a cada 5 s, lease de 30 s. Mensagem duplicada sem aquisição é reconhecida sem iniciar subprocesso. Atualizações exigem generation e leaseOwner; expirar a lease impede publicação antiga. Sandbox deve cessar execução após a perda da lease antes de liberar slot para novo processo.

| Origem | Destino | Condição |
|---|---|---|
| PENDING | DOWNLOADING | aquisição de lease e tentativa |
| DOWNLOADING | PROCESSING | entrada completa e validada |
| PROCESSING | COMPLETED | artefato validado, publicação autorizada |
| PENDING/DOWNLOADING/PROCESSING | CANCELLED | cancelamento vence CAS |
| PENDING/DOWNLOADING/PROCESSING | FAILED | falha ou limite |
| FAILED | PENDING | retry elegível, quota e novo evento outbox |
| DOWNLOADING/PROCESSING | PENDING | recuperação após lease vencida e registro de interrupção |
| COMPLETED | EXPIRED | expiresAt atingido |

Tentativa automática transiente usa 5 s e 20 s de backoff, no máximo 3 por ciclo. Retry manual de FAILED cria novo ciclo e geração no mesmo job, até 9 tentativas totais; limites valem também para recuperação. Revalidar URL/fonte a cada ciclo. Erros de política, mídia indisponível e parâmetros não geram retries automáticos. Históricos de tentativas preservam resultados. Cancelamento terminal não é desfeito; uma nova solicitação exige novo fluxo de inspeção/criação.

### Consistência e publicação

Transação cria job + outbox; dispatcher reenviável adiciona BullMQ com ID derivado de job/geração. Marcar outbox entregue depois de adicionar; duplicação tolerada. Reconciliação procura PENDING sem fila e execuções com lease vencida. Não depender só de jobId do Redis: retenção da fila pode remover IDs. PostgreSQL é fonte oficial de estado.

Sandbox produz saída em temporário; worker verifica resultado e move para staging no volume final, calcula checksum e confirma codecs/tamanho. Publicação usa rename atômico dentro do volume final e CAS em transação com cancelamento. Só registro FileArtifact + COMPLETED autoriza servir. Crash entre rename e commit deixa órfão inacessível, removido pelo coletor; crash após commit mantém arquivo disponível. Download pela API ocorre como stream com autorização antes de abrir e paths gerados; limpeza pode remover o nome após expiração sem publicar novo acesso.

Progresso de download ocupa 0–70 e conversão 70–99; sem denominador, progressIndeterminate=true e indicação de fase. Escritas no banco no máximo uma por segundo, sempre na mudança de fase; frontend consulta a cada 2 segundos enquanto houver ativos. Marcar 100 apenas após commit de COMPLETED.

### Retenção

Worker executa varredura a cada 5 minutos sob lock distribuído. Arquivos expiram após 24 horas; API aplica relógio imediatamente, limpeza física até 15 minutos. Histórico expira no menor valor entre createdAt+30 dias e context.expiresAt. Limpar arquivos antes de remover linhas e marcar falhas de limpeza para nova execução. Inspeções/miniaturas expiram em 10 minutos. Temporários e spools órfãos exigem verificação de lease/geração antes da remoção. Não remover volumes nem diretórios fora das raízes fixas.

## Risks / Trade-offs

- Duas fontes de estado (fila e banco) → outbox e reconciliação, testadas com falhas entre cada etapa.
- Crash entre filesystem e transação → arquivos órfãos inacessíveis e coleta idempotente.
- Processos externos travados → grupos de processos, deadlines, SIGKILL e limites de PIDs/memória.
- Progresso variável → fase indeterminada em vez de percentual fabricado.
- Subprocessos podem gerar muitos arquivos → quotas de bytes, disco e número de entradas por tentativa.

## Migration Plan

Aplicar migrations da fundação, habilitar gateway/sandbox e fixtures, implementar inspeção, pipeline, lifecycle e limpeza nessa ordem. Testar interrupções antes de integrar o frontend completo. Reverter versão sem apagar dados; pausar consumo ao detectar incompatibilidade do schema do spool.

## Referências verificadas

- [BullMQ: jobs idempotentes](https://docs.bullmq.io/patterns/idempotent-jobs) e [jobs interrompidos](https://docs.bullmq.io/guide/jobs/stalled) fundamentam tratamento de repetição e perda de lock; leases, spool e limites são decisões específicas deste projeto.
