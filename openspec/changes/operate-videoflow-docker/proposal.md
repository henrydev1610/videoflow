# Proposta — Operação local reproduzível

## Why

O produto precisa executar integralmente em Docker Desktop com WSL2, sem serviços instalados no Windows. A operação deve comprovar persistência, segurança de rede e processamento real antes de declarar a entrega concluída.

## What Changes

- Criar Compose com frontend, API, worker, PostgreSQL, Redis e proxy reverso.
- Acrescentar migration de execução única e gateway de saída para isolamento contra SSRF.
- Definir volumes, health checks, limites, restart policies e logs estruturados.
- Criar ambiente separado de desenvolvimento, testes e fixtures controladas.
- Documentar operação, backup, restauração e preparação para Ubuntu, sem deploy remoto.
- Registrar evidências de lint, tipos, testes, build, saúde e fluxos reais antes de arquivar mudanças.

## Capabilities

### New Capabilities

- `container-runtime`: execução Docker, rede restrita, persistência e desenvolvimento.
- `operational-verification`: testes reproduzíveis, evidências e procedimentos operacionais.

### Modified Capabilities

Nenhuma.

## Impact

Cria `compose.yaml`, `compose.dev.yaml`, `.dockerignore`, `.env.example`, Dockerfiles, configurações de proxy e documentação. A infraestrutura básica será implementada após a fundação e antes da integração de mídia; a validação final depende das outras três mudanças. Apenas a porta HTTP do proxy será publicada. Nenhum serviço externo ao projeto será alterado e nenhum volume persistente será apagado.
