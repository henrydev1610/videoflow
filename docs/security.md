# Controles de segurança do VideoFlow

## Implementados

Capacidade opaca de 256 bits em cookie host-only, HttpOnly, SameSite=Strict, Path=/api; Secure quando ORIGIN usa HTTPS. Apenas hash persistido. Origem exata e JSON obrigatórios nos POSTs; CORS restrito e headers Helmet. O cliente não escolhe requestId: a API gera um UUID e o retorna como x-request-id.

Rate limit compartilhado no Redis: 120 leituras, 10 mutações e 10 inspeções por minuto/IP, com contador Lua atômico, TTL e Retry-After de 60 segundos. Redis indisponível falha fechado. TRUSTED_PROXY vazio significa não confiar em X-Forwarded-For. Na composição final, TRUSTED_PROXY_HOST resolve somente videoflow-proxy; o primeiro salto precisa corresponder ao IP resolvido, renovado a cada 5 s e descartado se DNS falhar. Nginx sobrescreve os headers de forwarding.

Logs automáticos de requisição desativados. Erros são registrados por código público/requestId/status; URLs, cookies, tokens, stack e stderr não são incluídos. Falhas desconhecidas retornam mensagem genérica. DTOs estritos impedem campos internos na saída.

Política de URL: HTTP/HTTPS, portas 80/443, máximo 2048 caracteres, sem credenciais ou barras invertidas. Hosts localhost/local/Docker internos são negados. IPv4/IPv6 são classificados por ipaddr.js; aceita-se apenas unicast público, rejeitando endereços IPv4 mapeados em IPv6. Todas as respostas DNS são verificadas; resolver é injetável para testes adversariais. Allowlist faz comparação exata de host.

Arquivos são abertos com contenção de caminho real, verificação de symlinks em componentes e O_NOFOLLOW no destino; nome de download deriva de UUID. A API deve montar artefatos somente leitura. Um único Range válido é aceito. Arquivo vencido retorna 410; acesso estrangeiro retorna 404.

## Fronteiras integradas

O validador de URL não constitui proteção completa contra SSRF. O gateway fixa conexões no IP aprovado; sandbox isolado não alcança diretamente host, rede de dados ou Internet. Redirects/segmentos passam pelo gateway; subprocessos sem shell, protocolos locais restritos, quotas e limpeza com leases estão implementados. Evidências anteriores estão no relatório de mídia; a rodada da composição final está no relatório operacional. A exceção fixture:80 existe apenas no entrypoint da composição de testes. Runtime de produção não contém esse entrypoint.

## Erros principais

400 VALIDATION_ERROR/INVALID_URL; 403 CONTEXT_REQUIRED/ORIGIN_FORBIDDEN; 404 NOT_FOUND; 409 IDEMPOTENCY_CONFLICT/INSPECTION_EXPIRED/INVALID_STATE/FILE_NOT_READY; 410 FILE_EXPIRED/FILE_UNAVAILABLE; 413 BODY_TOO_LARGE; 415 JSON_REQUIRED; 416 INVALID_RANGE; 422 SOURCE_BLOCKED/FORMAT_UNAVAILABLE; 429 ACTIVE_LIMIT/RATE_LIMITED; 503 CAPACITY_EXCEEDED/RATE_LIMIT_UNAVAILABLE. Erros inesperados retornam 500 INTERNAL_ERROR sem detalhes privados.
