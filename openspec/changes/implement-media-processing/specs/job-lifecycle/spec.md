# Ciclo dos trabalhos

## Purpose

Preservar estados consistentes e histórico de tentativas durante processamento, cancelamento, falhas, reinicialização e expiração.

## ADDED Requirements

### Requirement: Máquina de estados
O sistema SHALL permitir PENDING→DOWNLOADING→PROCESSING→COMPLETED; estados ativos→FAILED ou CANCELLED; FAILED→PENDING em retry elegível; COMPLETED→EXPIRED. Nenhuma outra transição SHALL ocorrer, exceto recuperação ativa→PENDING com lease anterior vencida e nova tentativa registrada.

#### Scenario: Evento atrasado
- **WHEN** um worker antigo tenta atualizar um trabalho CANCELLED, COMPLETED ou EXPIRED
- **THEN** a atualização é rejeitada sem alterar progresso, estado ou artefato

### Requirement: Execução única efetiva
O sistema SHALL tolerar entrega repetida da fila, impedir execuções simultâneas do mesmo trabalho e limitar processamento global a 2, incluindo múltiplos workers. Cada tentativa SHALL ter identificador, geração de execução, início, fim e resultado persistidos.

#### Scenario: Mensagem duplicada
- **WHEN** dois consumidores recebem o mesmo trabalho
- **THEN** somente o detentor da execução vigente pode iniciar e publicar sua tentativa

### Requirement: Cancelamento durável
Cancelamento SHALL ser persistido antes da resposta 202, encerrar subprocessos em até 10 segundos, remover parciais e impedir publicação posterior. Repetir cancelamento de CANCELLED SHALL retornar 200 sem efeitos adicionais; conclusão anterior SHALL resultar em 409.

#### Scenario: Cancelar durante conversão
- **WHEN** o cancelamento vence a disputa de atualização com a publicação
- **THEN** o trabalho torna-se CANCELLED, a árvore de processos termina e nenhum arquivo fica acessível

### Requirement: Tentativas e recuperação limitadas
Falhas transitórias SHALL admitir no máximo 3 tentativas automáticas por ciclo com esperas de 5 e 20 segundos; falhas de política/formato SHALL não repetir automaticamente. Retry manual SHALL ser permitido apenas em FAILED, até 9 tentativas totais, preservando histórico e aplicando quotas novamente.

#### Scenario: Worker interrompido
- **WHEN** o worker morre durante transferência e sua lease expira
- **THEN** o reconciliador registra interrupção, remove parciais e agenda nova tentativa em até 120 segundos após restabelecimento dos serviços, respeitando o limite total

#### Scenario: Redis perde a mensagem
- **WHEN** existe trabalho pendente persistido sem mensagem correspondente na fila
- **THEN** a reconciliação o reenfileira sem criar outro trabalho nem duplicar tentativa concluída

### Requirement: Retenção e limpeza
Arquivos SHALL expirar 24 horas após conclusão e ser removidos em até 15 minutos. Histórico SHALL permanecer por até 30 dias da criação, limitado pela validade do contexto. Temporários órfãos SHALL ser removidos somente após verificar ausência de execução vigente.

#### Scenario: Histórico após expiração
- **WHEN** o arquivo completa 24 horas e o contexto ainda é válido
- **THEN** a consulta mostra EXPIRED, horários de expiração e indisponibilidade do download, preservando os metadados do trabalho

#### Scenario: Limpeza durante execução
- **WHEN** a rotina encontra diretório de tentativa com lease válida
- **THEN** preserva seus arquivos mesmo que a data de criação seja antiga
