# Tarefas — Docker e verificação

## 1. Imagens e serviços básicos

- [x] 1.1 Criar Dockerfiles multi-stage, .dockerignore e imagens fixadas após checagem de compatibilidade; verificar build limpo e versões dos binários no runtime final.
- [ ] 1.2 Criar Compose com PostgreSQL/Redis persistentes, health checks, AOF/noeviction e redes internas; verificar saúde, persistência e ausência de portas publicadas de dados.
- [x] 1.3 Criar serviço migrate e dependências por saúde/conclusão; testar primeira inicialização e migration com falha sem apagar volumes.
- [x] 1.4 Configurar API/worker/frontend/proxy, rota /api, fallback SPA e forwarding headers; verificar navegação direta, health e proteção contra IP forjado.
- [x] 1.5 Configurar usuários, permissões de volumes, limites CPU/memória/PIDs, read-only, tmpfs e rotação de logs; verificar configuração efetiva e ausência de root desnecessário, privileged e Docker socket.
- [ ] 1.6 Entregar .env.example e README de inicialização local com defaults funcionais; testar docker compose up -d --build sem instalação de dependências no host.

## 2. Fronteira de rede de mídia

- [x] 2.1 Implementar gateway HTTP/CONNECT com validação A/AAAA, IP pinning, portas/allowlists e timeouts; testar IPs privados/reservados, DNS misto, rebinding, redirects e hostname TLS.
- [x] 2.2 Configurar sandbox somente na rede interna de mídia e comunicação por spool, sem rede de dados nem credenciais; testar conexão direta negada ao host, PostgreSQL, Redis e Internet.
- [ ] 2.3 Integrar proxy explícito nas ferramentas e ffmpeg local com protocolos restritos; testar recurso secundário/manifest malicioso e indisponibilidade do gateway com falha fechada.
- [x] 2.4 Documentar topologia e política de rede, incluindo serviços auxiliares; verificar diagrama contra compose config e inspeção real dos containers.

## 3. Desenvolvimento e qualidade

- [ ] 3.1 Criar compose.dev.yaml com HMR/watch e node_modules Linux em volumes; testar alteração de frontend/API no Windows sem dependências no host.
- [x] 3.2 Criar compose.test.yaml isolado e fixture sintética autorizada; testar exceção mínima de destino da fixture e provar que produção não contém bypass de SSRF.
- [ ] 3.3 Criar serviços/scripts de lint, Prettier, typecheck, Vitest, build e Playwright com versões compatíveis; verificar execução em container e propagação de exit code não zero.
- [ ] 3.4 Documentar comandos de desenvolvimento e testes em PowerShell e shell; executar os exemplos e registrar seus resultados.

## 4. Operação e retenção

- [ ] 4.1 Configurar health checks de todos os serviços contínuos e heartbeat do worker/sandbox; testar componentes indisponíveis e diagnóstico sem segredos.
- [ ] 4.2 Integrar comando operacional de limpeza por retenção sem apagar volumes; testar preservação de arquivos válidos e tentativas com lease vigente.
- [ ] 4.3 Documentar e testar backup/restore do PostgreSQL em projeto de teste isolado e procedimento coordenado dos artefatos; conferir restauração dos metadados e explicar limites do backup somente do banco.
- [ ] 4.4 Documentar parada, logs, rebuild, migrations, reinício, limites e recuperação; verificar comandos seguros e avisos explícitos antes de qualquer comando destrutivo apresentado.
- [x] 4.5 Entregar guia futuro de VPS Ubuntu com TLS, domínio, segredos, firewall, saída, backups, monitoramento e rollback; revisar sem executar deploy remoto.

## 5. Aceitação integrada do produto

- [ ] 5.1 Executar lint, formatação, typecheck, testes unitários/integração/E2E e todos os builds; salvar evidências com comando, versão, data e exit code.
- [x] 5.2 Executar processamento real MP3/MP4 nas três qualidades com fixture autorizada e ffprobe; comprovar worker consumindo jobs, ferramentas disponíveis e arquivos baixáveis só pelo contexto autorizado.
- [ ] 5.3 Executar cancelamento, retry, expiração, duplicação e reinício de API/worker/Redis no projeto de teste; comprovar recuperação limitada, ausência de efeitos duplicados e persistência.
- [ ] 5.4 Executar testes adversariais de rede e isolamento entre visitantes nos endpoints e navegador; comprovar bloqueios por conexão e não somente por validação de texto.
- [ ] 5.5 Subir stack local final, verificar frontend, API, banco, fila, worker, sandbox, gateway, migrations e volumes; registrar compose ps e URL local efetivamente acessível.
- [ ] 5.6 Criar matriz dos requisitos das dez capabilities versus testes/evidências e revisar consistência OpenSpec/implementação; validar mudanças com openspec validate --all --strict e registrar pendências reais.

## Workflow follow-up

- A infraestrutura básica antecede integração de mídia; este grupo final ocorre depois de todas as funcionalidades.
- Sincronizar e arquivar apenas mudanças completamente implementadas e verificadas, sem commits/push.
- Entregar resumo da arquitetura, estrutura, versões, serviços, testes, builds, saúde, comandos, URL e limitações reais.
