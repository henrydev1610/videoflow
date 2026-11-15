# Verificação e operação

## Purpose

Comprovar o comportamento do produto por testes reproduzíveis e orientar manutenção local e futura implantação sem alegações não verificadas.

## ADDED Requirements

### Requirement: Suíte reproduzível
O projeto SHALL executar lint, formatação, typecheck strict, testes unitários, integração, E2E e build dentro de containers, com falhas propagadas por exit code. Testes SHALL usar fixtures e mocks controlados, sem depender de conteúdo do YouTube ou substituir integrações de produção por mocks.

#### Scenario: Validação completa
- **WHEN** o comando documentado de verificação é executado
- **THEN** registra comandos, versões, horários, resultados e relatórios de cada etapa sem marcar etapas não executadas como aprovadas

### Requirement: Conversão real autorizada
A integração SHALL gerar mídia sintética autorizada, servi-la em fixture controlada e executar yt-dlp e FFmpeg reais para MP3 e MP4 nas três qualidades. SHALL verificar codecs, resolução, bitrate-alvo, duração, tamanho e download autorizado.

#### Scenario: Fonte de resolução inferior
- **WHEN** a fixture de 480p é processada em MP4 alta
- **THEN** a verificação com ffprobe confirma ausência de upscale e arquivo reproduzível

### Requirement: Segurança e recuperação verificadas
Testes SHALL cobrir DNS privado/misto/rebinding, redirects, protocolos proibidos, path traversal, isolamento de dois contextos, limites, cancelamento, retry, expiração, duplicação de fila e reinício de worker/API/Redis. Testes de rede SHALL provar bloqueio de conexão, não apenas validação de strings.

#### Scenario: Isolamento ponta a ponta
- **WHEN** dois contextos de navegador independentes operam e um tenta baixar o arquivo do outro
- **THEN** a API nega com 404 e a interface não exibe dados cruzados

#### Scenario: Reinício durante trabalho
- **WHEN** um worker é interrompido durante processamento da fixture e reinicia
- **THEN** o trabalho termina ou falha de forma explícita após tentativas limitadas, sem publicação duplicada ou estado ativo permanente

### Requirement: Documentação operacional
A documentação SHALL cobrir inicialização, parada, logs, reconstrução, migrations, testes, saúde, reinício, limpeza segura, backup e restauração. Comandos que eliminem volumes SHALL apresentar aviso explícito e nunca ser executados automaticamente.

#### Scenario: Backup restaurável
- **WHEN** o procedimento é testado em projeto Compose de teste isolado
- **THEN** um backup do PostgreSQL restaura metadados e a documentação explica que arquivos exigem backup separado coordenado

### Requirement: Conclusão rastreável
Mudanças SHALL permanecer abertas enquanto houver tarefa ou verificação pendente. Somente mudanças integralmente implementadas e verificadas SHALL ser sincronizadas e arquivadas, com matriz de requisitos e evidências. A entrega SHALL declarar limitações reais.

#### Scenario: Falha de Docker
- **WHEN** Docker não está disponível ou a validação de processamento falha
- **THEN** a entrega registra o impedimento e mantém os itens correspondentes pendentes sem declarar o produto pronto

### Requirement: Preparação para Ubuntu
A documentação SHALL orientar domínio, HTTPS, variáveis, firewall, políticas de saída, volumes, backups, limites e monitoramento em VPS Ubuntu, sem executar deploy remoto nesta etapa.

#### Scenario: Revisão do procedimento futuro
- **WHEN** o operador consulta o guia de VPS
- **THEN** encontra os pré-requisitos e passos planejados, claramente separados das verificações locais executadas
