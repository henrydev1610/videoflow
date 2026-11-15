# Acesso anônimo

## Purpose

Permitir acesso sem contas e preservar a separação de trabalhos e arquivos entre contextos de navegador.

## ADDED Requirements

### Requirement: Inicialização sem autenticação
O sistema SHALL emitir uma capacidade anônima criptograficamente aleatória de 256 bits, válida por 30 dias, sem login, cadastro ou entidade de usuário. O segredo SHALL permanecer em cookie HttpOnly, SameSite=Strict e Secure em HTTPS, com apenas seu hash persistido.

#### Scenario: Primeiro acesso
- **WHEN** um navegador sem capacidade chama POST /api/context na origem permitida
- **THEN** recebe 201 e cookie de capacidade, sem fornecer dados pessoais, e um contexto vazio com expiresAt

#### Scenario: Contexto existente
- **WHEN** um navegador com capacidade válida chama POST /api/context
- **THEN** recebe 200 com a mesma validade, sem renovar indefinidamente a expiração

### Requirement: Isolamento de todas as operações
O sistema SHALL restringir listagem, indicadores, detalhes, cancelamento, repetição, inspeções e arquivos ao contexto válido. IDs imprevisíveis SHALL complementar, mas nunca substituir, a autorização.

#### Scenario: Acesso cruzado
- **WHEN** o contexto B tenta consultar, cancelar, repetir ou baixar um ID pertencente ao contexto A
- **THEN** recebe 404 sem metadados, arquivo ou indicação da existência do trabalho

#### Scenario: Listagem isolada
- **WHEN** B consulta lista ou indicadores após A criar um trabalho
- **THEN** nenhum dado de A aparece na resposta de B

### Requirement: Expiração e perda de capacidade
O sistema SHALL rejeitar capacidade ausente, inválida ou expirada com 403 CONTEXT_REQUIRED nos endpoints protegidos e permitir criar um novo contexto vazio. Limpar cookies SHALL perder o acesso anterior sem oferecer recuperação por conta.

#### Scenario: Capacidade expirada
- **WHEN** um cookie ultrapassa os 30 dias de validade
- **THEN** o sistema rejeita o acesso anterior e informa a necessidade de iniciar outro contexto

### Requirement: Proteção de requisições e segredos
O sistema SHALL aceitar mutações somente com Origin permitido e conteúdo JSON, bloquear origens externas e omitir cookies, capacidades e URLs completas de logs. Respostas privadas SHALL usar Cache-Control: no-store.

#### Scenario: Requisição de outra origem
- **WHEN** um site externo envia uma mutação usando cookies do visitante
- **THEN** recebe 403 sem alteração persistida e sem CORS permissivo
