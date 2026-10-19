# Checklist — Como fazer backup dos seus dados

Use este guia para salvar uma cópia dos seus pedidos, itens, linhas e configurações antes de qualquer atualização ou troca de computador.

---

## Passo a passo

### 1. Abra o sistema
- Acesse o PCP Control no navegador onde você costuma usar (Edge, Chrome, etc.).
- Faça login normalmente com seu usuário e senha.

### 2. Abra as ferramentas do navegador
- Pressione a tecla **F12** no teclado.
- Ou clique com o botão direito em qualquer lugar da tela e escolha **"Inspecionar"** ou **"Inspecionar elemento"**.

### 3. Vá para a aba Console
- No painel que abriu (geralmente na parte de baixo ou ao lado da tela), clique na aba **"Console"**.
- Se não aparecer, procure por um menu com as opções: Elements, Console, Network, etc.

### 4. Copie o script de backup
- Abra o arquivo **export-local-data.js** (ele fica na pasta do projeto).
- Selecione todo o conteúdo (Ctrl+A).
- Copie (Ctrl+C).

### 5. Cole no Console
- Clique dentro da área do Console (onde aparece texto).
- Cole o que você copiou (Ctrl+V).
- Pressione **Enter**.

### 6. Aguarde o download
- Em poucos segundos, um arquivo será baixado automaticamente.
- O nome será algo como: **pcp-backup-2025-03-19-12-00-00.json**
- A pasta de downloads do seu navegador é o destino padrão.

### 7. Guarde o arquivo em local seguro
- Mova o arquivo para uma pasta de backup, pendrive ou nuvem.
- Não altere o nome nem o conteúdo do arquivo.

### 8. Repita em cada navegador
- Se você usa o sistema no **Edge** e no **Chrome**, faça o backup em **cada um**.
- Cada navegador guarda dados separados, então é importante fazer nos dois.

---

## Dúvidas comuns

**O que o backup contém?**  
Pedidos, itens, programação de produção, linhas, dados da empresa, usuários e feriados.

**O backup apaga ou altera algo?**  
Não. O script apenas lê os dados e gera um arquivo. Nada é modificado.

**Posso fazer backup mais de uma vez?**  
Sim. Você pode fazer quantos backups quiser. O ideal é fazer antes de atualizações ou troca de computador.

**O que fazer se der erro?**  
Verifique se você está logado no sistema e se a aba do Console está na mesma página do PCP Control. Tente recarregar a página (F5) e repetir os passos.

---

## Resumo rápido

1. Abrir o PCP Control e fazer login  
2. Pressionar F12  
3. Clicar na aba Console  
4. Copiar o conteúdo do arquivo export-local-data.js  
5. Colar no Console e pressionar Enter  
6. Guardar o arquivo que foi baixado  

---

*Documento criado na Fase 2 do projeto de backup.*
