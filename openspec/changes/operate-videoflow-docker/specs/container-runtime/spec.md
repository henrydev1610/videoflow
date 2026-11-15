# Execução em containers

## Purpose

Executar o VideoFlow localmente de forma reproduzível com isolamento de rede e dados persistentes no Docker Desktop com WSL2.

## ADDED Requirements

### Requirement: Inicialização completa
docker compose up -d --build SHALL construir e iniciar frontend, API, worker, PostgreSQL, Redis e proxy, disponibilizando http://localhost:8080. SHALL dispensar Node.js, banco, Redis, yt-dlp e FFmpeg no host; configuração local inicial SHALL funcionar sem edição obrigatória de arquivos.

#### Scenario: Primeira inicialização
- **WHEN** o comando é executado com Docker Desktop/WSL2 operacional em ambiente limpo
- **THEN** migrations terminam com sucesso e todos os serviços contínuos ficam saudáveis, com interface e API acessíveis pelo proxy

### Requirement: Ordenação e falhas de migrations
Migrations SHALL ser executadas por serviço único antes de API e worker iniciarem operações. Erro de migration SHALL impedir a inicialização funcional dos dependentes, preservar volumes e gerar diagnóstico sem segredos.

#### Scenario: Migration inválida
- **WHEN** a aplicação de uma migration falha
- **THEN** API e worker não processam solicitações e o banco não é apagado para tentar corrigir o problema

### Requirement: Rede restrita
Somente o proxy reverso SHALL publicar porta no host. PostgreSQL e Redis SHALL permanecer em rede interna, worker SHALL não publicar HTTP, e ferramentas externas SHALL alcançar apenas o gateway de saída autorizado. SHALL não montar Docker socket nem usar modo privileged.

#### Scenario: Inspeção de exposição
- **WHEN** a configuração efetiva e as portas dos containers são inspecionadas
- **THEN** somente a porta HTTP configurada aparece publicada e banco/fila não são acessíveis diretamente do host

### Requirement: Persistência e recursos
Banco, fila, artefatos e temporários SHALL usar volumes separados. Serviços SHALL possuir health checks, limites de memória/CPU/PIDs, logs estruturados e restart policies adequadas. Runtime SHALL usar usuário não root, salvo inicialização mínima documentada de permissões ou isolamento.

#### Scenario: Reinício sem perda
- **WHEN** os containers são reiniciados sem remover volumes
- **THEN** contexto, histórico e artefatos válidos persistem e trabalhos interrompidos são reconciliados

### Requirement: Desenvolvimento isolado
compose.dev.yaml SHALL oferecer hot reload de frontend e API e dependências Linux em volumes próprios, sem compartilhar node_modules do Windows. O modo de desenvolvimento SHALL preservar isolamento de visitantes e controles de rede de mídia.

#### Scenario: Alteração de código
- **WHEN** um arquivo de frontend é alterado no Windows com o ambiente de desenvolvimento ativo
- **THEN** a interface atualiza sem reinstalar dependências no host ou reconstruir todos os serviços
