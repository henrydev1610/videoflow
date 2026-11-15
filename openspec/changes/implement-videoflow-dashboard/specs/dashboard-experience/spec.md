# Experiência operacional

## Purpose

Oferecer uma interface de gestão completa, acessível e responsiva para acompanhar mídias no contexto do navegador.

## ADDED Requirements

### Requirement: Navegação de produto
A aplicação SHALL oferecer sidebar e header com rotas Dashboard (/), Novo Download (/new), Gerenciador (/downloads), Histórico (/history) e Configurações (/settings), sem telas de conta. SHALL funcionar de 360 a 1440 pixels, com menu móvel, foco visível e navegação por teclado.

#### Scenario: Acesso direto móvel
- **WHEN** o visitante abre /history diretamente em viewport de 360 pixels
- **THEN** a página carrega, a navegação móvel é utilizável e ações essenciais não ficam cortadas

### Requirement: Dashboard real
O dashboard SHALL exibir total, concluídos, ativos, falhos e cancelados do contexto, atividades recentes e atalho para criação. SHALL distinguir carregamento, vazio e erro; nunca substituir falha de API por números fictícios ou zero enganoso.

#### Scenario: API indisponível
- **WHEN** a consulta de indicadores falha
- **THEN** aparece erro com opção de tentar novamente e nenhum dado inventado

### Requirement: Fluxo de criação completo
A página de criação SHALL validar URL, consultar metadados, mostrar título, duração, miniatura e origem quando disponíveis, permitir MP3/MP4 e baixa/média/alta e exigir confirmação de autorização. SHALL invalidar a inspeção ao mudar a URL e tratar indisponibilidade sem iniciar um job.

#### Scenario: Criação confirmada
- **WHEN** o visitante confirma direitos e inicia uma opção disponível após inspeção válida
- **THEN** vê o trabalho real retornado pela API e acompanha seu progresso sem depender de recarregar a página

#### Scenario: Duplo clique
- **WHEN** o visitante aciona iniciar repetidamente enquanto a requisição está em andamento
- **THEN** a interface reutiliza a chave idempotente e apresenta um único trabalho

### Requirement: Gerenciamento contextual
O gerenciador SHALL mostrar título, formato, qualidade, status, progresso, data, tamanho conhecido e ações. SHALL habilitar cancelar em ativos, repetir em FAILED elegível e baixar em COMPLETED não expirado. Modais, badges, toasts e atualização automática SHALL refletir a resposta efetiva da API.

#### Scenario: Estado alterado durante ação
- **WHEN** o visitante cancela um trabalho que acaba de concluir e recebe 409
- **THEN** a interface atualiza os dados e explica o conflito sem mostrar cancelamento bem-sucedido

### Requirement: Histórico consultável
O histórico SHALL oferecer pesquisa, filtros de status/formato, ordenação, paginação e detalhes com tentativas, erros seguros e expiração. SHALL preservar filtros na URL e considerar todos os trabalhos retidos do contexto, incluindo ativos.

#### Scenario: Pesquisa sem resultados
- **WHEN** os filtros não encontram trabalhos
- **THEN** aparece estado vazio com ação de limpar filtros, sem apagar o histórico existente

### Requirement: Acessibilidade e contexto perdido
A interface SHALL possuir rótulos associados, contraste WCAG AA, feedback que não dependa só de cor, diálogos com foco controlado, skeletons e regiões de anúncio. Ao perder contexto SHALL limpar cache privado e explicar a perda de acesso antes de inicializar novo histórico.

#### Scenario: Expiração durante uso
- **WHEN** uma consulta retorna CONTEXT_REQUIRED
- **THEN** os dados antigos saem da interface e o visitante recebe explicação e ação para iniciar novo contexto
