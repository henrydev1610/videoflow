# Preferências locais

## Purpose

Personalizar tema e padrões de apresentação e criação sem vincular preferências a contas ou serviços remotos.

## ADDED Requirements

### Requirement: Preferências persistentes
A aplicação SHALL persistir tema claro, escuro ou sistema, formato mp4/mp3, qualidade baixa/média/alta, densidade confortável/compacta e tamanho de página 10/20/50 no armazenamento local. Padrões SHALL ser sistema, mp4, média, confortável e 20.

#### Scenario: Retorno ao navegador
- **WHEN** o visitante salva tema escuro e formato mp3 e recarrega
- **THEN** o tema é aplicado e o próximo formulário começa em mp3 sem alterar trabalhos existentes

### Requirement: Armazenamento resiliente
A aplicação SHALL validar preferências versionadas e usar padrões em dados inválidos ou armazenamento indisponível. Nenhuma capacidade, URL de mídia ou segredo SHALL ser armazenado junto às preferências.

#### Scenario: Preferências corrompidas
- **WHEN** o armazenamento contém JSON inválido ou qualidade desconhecida
- **THEN** a aplicação permanece utilizável e restaura os padrões pertinentes

### Requirement: Tema consistente
Todas as páginas, tabelas, menus, modais, notificações e estados de carregamento SHALL respeitar o tema escolhido, incluindo preferência do sistema e redução de movimento.

#### Scenario: Alteração do sistema
- **WHEN** o tema está em sistema e o dispositivo muda para modo escuro
- **THEN** a interface muda sem recarregar nem perder dados de formulário
