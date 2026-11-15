---
name: VideoFlow
description: Painel operacional de mídia, com superfícies neutras e ações verdes.
colors:
  background: '#f4f6f5'
  surface: '#fff'
  foreground: '#202b29'
  muted: '#e9eeeb'
  muted-foreground: '#596963'
  primary: '#175444'
  primary-foreground: '#fff'
  secondary: '#e5eeea'
  border: '#d7dfda'
  destructive: '#b42335'
  sidebar: '#173d35'
  sidebar-text: '#e4eee8'
  success: '#21643b'
  warning: '#815600'
  error: '#ac2738'
  dark-background: '#111916'
  dark-surface: '#19231f'
  dark-foreground: '#edf2ef'
  dark-muted: '#27332c'
  dark-muted-foreground: '#aebfb4'
  dark-primary: '#a1d8be'
  dark-primary-foreground: '#10291f'
  dark-secondary: '#2b4035'
  dark-border: '#3d4d43'
  dark-destructive: '#ed8998'
  dark-sidebar: '#101e18'
  dark-sidebar-text: '#e2ede6'
  dark-success: '#a1d8b4'
  dark-warning: '#eac67b'
  dark-error: '#f3a2ae'
typography:
  headline:
    fontFamily: 'Segoe UI, system-ui, sans-serif'
    fontSize: '29px'
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  title:
    fontFamily: 'Segoe UI, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: 'Segoe UI, system-ui, sans-serif'
    fontSize: '14px'
    lineHeight: 1.5
  label:
    fontFamily: 'Segoe UI, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 600
  supporting:
    fontSize: '12px'
rounded:
  sm: '4px'
  md: '6px'
  lg: '10px'
spacing:
  small: '8px'
  control-gap: '12px'
  medium: '16px'
  panel: '24px'
  form-panel: '28px'
  large: '32px'
  workspace: '36px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    height: '36px'
    padding: '8px 16px'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    height: '36px'
  button-ghost:
    rounded: '{rounded.md}'
    height: '36px'
  button-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '#fff'
    rounded: '{rounded.md}'
    height: '36px'
  input:
    rounded: '{rounded.md}'
    height: '36px'
    padding: '4px 12px'
  panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.lg}'
  navigation-active:
    backgroundColor: '#d7e8de'
    textColor: '#173d35'
    rounded: '{rounded.md}'
    padding: '11px 12px'
---

# Design System: VideoFlow

## Overview

**Creative North Star: "Painel operacional CRM"**

Painel operacional sóbrio, organizado como um CRM: navegação lateral verde, superfícies neutras e informação compacta. A hierarquia privilegia títulos claros, estados legíveis e ações próximas de cada solicitação.

Este registro descreve a implementação em `src/styles.css`, `src/main.tsx`, `src/pages.tsx` e `src/components`. A direção operacional e a tipografia de sistema foram aprovadas em `PRODUCT.md`; não se trata de uma proposta visual ou de um conjunto de dados demonstrativo.

**Key Characteristics:**

- Superfícies claras ou escuras separadas por bordas discretas.
- Verde para ações e navegação; cores semânticas acompanhadas de texto.
- Tabelas compactas, números tabulares e detalhes em painel lateral.
- Navegação por teclado e adaptação para telas estreitas.

## Colors

A paleta combina verde profundo, verdes claros e neutros levemente esverdeados. Os valores normativos acima reproduzem as propriedades do CSS; as chaves com prefixo `dark-` substituem as equivalentes no tema escuro. As referências de componentes acima descrevem o modo claro; o CSS usa variáveis semânticas para alternar o tema.

O sidecar `.impeccable/design.json` estende este registro com amostras dos componentes e metadados. Suas rampas tonais são interpolações para visualização, não novas cores adotadas pelo app.

### Primary

O verde de ação (`primary`) distingue botões, links, foco e progresso. `primary-foreground` garante o texto correspondente. A barra lateral usa `sidebar` e `sidebar-text`; a seleção da navegação mantém seu verde claro nos dois temas.

### Neutral

`background` sustenta a área de trabalho; `surface` destaca cabeçalho, painéis e sobreposições. `foreground` e `muted-foreground` separam informação principal e apoio; `border` delimita estruturas; `muted` atende esqueletos/progresso e `secondary` estados suaves de controles. Apesar do nome técnico, `secondary` é uma superfície verde neutra, não uma segunda identidade cromática.

### Semantic states

`success` identifica conclusão, `warning` atividade e `error` falha. `destructive` é reservado à ação de cancelamento. Cancelado e expirado usam texto atenuado. O texto destrutivo muda no tema escuro para o tom escuro definido no CSS.

**The Text-and-Color Rule.** Todo estado operacional tem um rótulo; pontos e cores apenas reforçam seu significado.

## Typography

A família única é Segoe UI com fallback de sistema e sans-serif, conforme a decisão explícita do produto. Não há fonte de marketing ou escala editorial de display.

O título de página usa `headline`, reduzido para (25px) no mobile. Títulos de seção usam `title`; subtítulos usam (16px, 600). Corpo usa `body`; rótulos usam `label`; tabelas e informação secundária usam (12px). Estados usam (11px), reduzidos para (10px) nas tabelas mobile. Os indicadores usam (32px, 600, 1.2), reduzidos para (28px), com números tabulares; tamanhos de arquivo também usam números tabulares. A densidade compacta reduz espaço das linhas sem reduzir o texto.

## Layout

O shell ocupa no mínimo a altura da janela. Sidebar fixa de (232px), cabeçalho de (78px) e área principal com (36px) de respiro. Em até (1100px), a sidebar passa a (200px), o respiro principal a (24px), a criação vira coluna única e colunas secundárias da tabela são ocultadas. Seus dados continuam no painel de detalhes.

Em até (767px), a sidebar dá lugar a um drawer esquerdo, o cabeçalho mede (66px) e o conteúdo recebe (26px 16px). Os cinco indicadores passam de cinco colunas a duas, com o último ocupando a largura. Busca ocupa uma linha inteira; filtros e paginação usam duas colunas. Tabelas priorizam mídia, estado e ações. O formulário empilha URL e botão; detalhes usam (95vw), limitados a (440px). Configurações limitam o painel a (800px) em telas amplas.

O ritmo combina intervalos pequenos entre controles e blocos de (24–36px) entre regiões. Títulos longos truncam na tabela e quebram livremente nos detalhes. Não há um grid universal de cards: a tabela é a superfície principal de gestão.

## Elevation & Depth

Painéis e indicadores são planos, separados por bordas de um pixel e tons de superfície. Inputs e botões outline herdam a sombra `shadow-xs` do Tailwind; diálogos e drawers usam `shadow-lg` e overlay preto a 50%. A profundidade serve à sobreposição, sem sombras decorativas nos painéis de dados.

**The Flat-Panel Rule.** Painéis de informação permanecem planos; as sobreposições recebem a maior elevação.

O CSS aplica foco visível de (3px) com afastamento de (3px), complementado pelos anéis dos componentes. A preferência de movimento reduzido desliga animações e transições. Classes de animação presentes nos componentes não constituem garantia de animação sem sua definição CSS.

## Shapes

Controles usam cantos moderados (`md`), painéis e agrupamentos usam `lg`. Pontos de estado são círculos; não há cards em formato de pílula. Bordas sutis estruturam tabelas, divisórias e grupos. Os pequenos ícones de arquivo usam cantos de (5px); isso é um detalhe do componente, não uma nova escala global.

## Components

### Buttons

O botão primário é preenchido, com texto contrastante e ícones Lucide opcionais. O componente padrão tem peso (500), hover com primária a 90%, anel de foco e opacidade reduzida quando desabilitado. Outline atende ações secundárias; ghost atende ações compactas e alternância de tema; destructive confirma cancelamento. O link de criação em estados vazios é uma variante CSS com peso (600) e padding (10px 16px). Não uniformizar silenciosamente essas duas implementações.

### Inputs / Fields

Inputs usam borda, fundo transparente no claro e tom de borda translúcido no escuro, foco verde e erro destrutivo. Busca mede (38px); URL mede (40px). Selects nativos têm altura (38px), fundo de superfície e rótulo visível. Radio e checkbox usam o acento primário. Erros aparecem em texto específico junto ao campo.

### Navigation

Navegação com ícones e rótulos, peso (500), padding (11px 12px). Hover usa verde mais claro que a sidebar; seleção usa fundo verde claro e texto escuro com peso (650). O drawer mobile reutiliza os destinos e fecha após seleção. O link de salto torna-se visível ao receber foco.

### Cards / Containers

Painéis têm superfície semântica, borda e cantos `lg`, sem sombra. Cabeçalhos de seção usam divisória; filtros, tabela e paginação pertencem ao mesmo painel. Esqueletos representam carregamento; vazios apresentam uma explicação e uma ação adequada ao contexto.

### Status and progress

O estado é um rótulo com ponto circular, sem cápsula preenchida. A faixa de progresso mede (3px) de altura, com largura (90px), reduzida para (64px) no mobile. Progresso indeterminado mostra “Aguardando estimativa” e faixa animada de 30%; não apresenta uma porcentagem estimada. A animação própria usa (1.4s ease-in-out), alternada.

### Tables, details and feedback

Tabelas têm cabeçalho discreto, separadores horizontais, títulos clicáveis e ações com nomes acessíveis. A densidade compacta reduz padding vertical para (10px). O drawer direito agrupa metadados, tentativas e validade; a validade combina data absoluta e tempo restante atualizado localmente. Cancelamento abre confirmação com restauração de foco. Alertas de falha de atualização preservam dados anteriores e os marcam como desatualizados, inclusive nos detalhes. Toasts comunicam resultados das mutações.

## Do's and Don'ts

### Do:

- **Do** reutilize os tokens semânticos e suas variantes de tema.
- **Do** mantenha rótulos textuais de estado e nomes acessíveis nas ações com ícones.
- **Do** preserve o conteúdo anterior quando a atualização falhar e identifique dados desatualizados.
- **Do** use metadados e contadores reais; mantenha vazio, carregamento e falha distintos.

### Don't:

- **Don't** substitua a hierarquia operacional por gráficos decorativos ou indicadores inventados.
- **Don't** dependa somente da cor para comunicar estado.
- **Don't** exponha uma ação de download funcional após a expiração conhecida.
- **Don't** esconda o título completo: mantenha acesso por detalhes e conteúdo acessível.
