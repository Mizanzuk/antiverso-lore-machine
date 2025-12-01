# Blake Vision - Mudanças de UI/UX

## Análise Completa

### Componentes Identificados

#### 1. Sidebar (app/page.tsx, linha 650-819)
- Dropdown de Universos (linha 704-706)
- Botão "Sair" (linha 818)
- Links de Ferramentas (linha 811-813)

#### 2. Catálogo (app/page.tsx, linha 890-1010)
- Filtros de mundo, tipo, episódio
- Grid de fichas
- Botões de categoria

#### 3. Upload (app/lore-upload/page.tsx)
- Checkboxes de categorias

---

## Mudanças a Implementar

### #9 - Menu de perfil com dropdown
**Local:** Linha 818 (rodapé sidebar)
**Mudança:** Substituir botão "Sair" por dropdown com:
- Avatar/Email do usuário
- Opção "Tema" (placeholder)
- Opção "Editar Perfil" (placeholder)
- Opção "Sair"

### #18 - Auditoria de tipografia
**Ação:** Procurar por `font-serif` ou inputs/textareas com fontes serifadas
**Substituir por:** `font-sans` ou remover declarações de fonte

### #19 - Padronizar dropdowns
**Padrão:** UniverseDropdown (linha 704-706)
**Aplicar em:** Filtros do Catálogo (mundos, tipos, episódios)

### #20 - Seta dentro do box
**Local:** Todos os dropdowns
**Mudança:** CSS para posicionar seta dentro do box (não flutuando)

### #21 - Botão "Categorias" com moldura
**Local:** Catálogo (linha 931-945)
**Mudança:** Adicionar `border` aos botões de categoria

### #23 - Ícones Editar/Apagar nas fichas
**Local:** Grid de fichas do Catálogo (linha 967-1010)
**Mudança:** Adicionar ícones ✎ e × no hover (mesmo padrão linha 710-731)

### #25 - Padronizar cores dos checkboxes
**Local:** app/lore-upload (checkboxes de categorias)
**Mudança:** CSS customizado para checkboxes (cor rosa do tema)

### #24 - Seleção múltipla de fichas
**Local:** Catálogo
**Mudança:** 
- Botão "Selecionar fichas" abaixo da busca
- Checkboxes aparecem em cada ficha
- Botões "Exportar" e "Apagar" quando há seleção

### #26 - Drag-and-drop
**Local:** Catálogo
**Mudança:** Usar @dnd-kit/core para reordenação visual temporária

---

## Ordem de Implementação

1. ✅ Correções simples de CSS (#18, #20, #21, #25)
2. ✅ Menu de perfil (#9)
3. ✅ Padronizar dropdowns (#19)
4. ✅ Ícones nas fichas (#23)
5. ✅ Seleção múltipla (#24)
6. ✅ Drag-and-drop (#26)
