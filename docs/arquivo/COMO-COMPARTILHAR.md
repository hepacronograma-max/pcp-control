# Como compartilhar o PCP Control com outras pessoas

## Mesma rede (Wi-Fi/LAN)

Quando o servidor está rodando, outras pessoas na **mesma rede** podem acessar o sistema.

### Passo 1: Iniciar o servidor
Execute o `Abrir-PCP-Control.bat` no computador que ficará como servidor.

### Passo 2: Criar atalho na Área de Trabalho
Execute o `Criar-Atalho-Area-De-Trabalho.bat`. Isso vai:
- Detectar o IP do computador na rede
- Criar um atalho "PCP Control" na Área de Trabalho
- Mostrar o link de acesso (ex: `http://192.168.1.100:3100/dashboard`)

### Passo 3: Compartilhar com outras pessoas
- **Opção A:** Envie o link (ex: `http://192.168.1.100:3100/dashboard`) para as outras pessoas. Elas acessam pelo navegador.
- **Opção B:** Copie o arquivo `PCP Control.url` da sua Área de Trabalho e envie para as outras pessoas. Elas podem colar na Área de Trabalho delas.
- **Opção C:** As outras pessoas podem criar o atalho no computador delas executando o `Criar-Atalho-Area-De-Trabalho.bat` — mas isso criará um atalho apontando para o IP do computador delas. O correto é usar o IP do **servidor** (o PC onde o PCP Control está rodando).

### Importante
- O computador que executa o `Abrir-PCP-Control.bat` deve ficar **ligado** e com o servidor rodando.
- O firewall do Windows pode bloquear a porta 3100. Se não funcionar, permita o Node.js no firewall ou desative temporariamente para testar.
- O IP pode mudar se o roteador usar DHCP. Se o link parar de funcionar, execute novamente o `Criar-Atalho-Area-De-Trabalho.bat` para obter o novo IP.

---

## Redes diferentes (internet)

Para acesso de **outras redes** (ex: filial, home office), é necessário:

1. **Deploy em um servidor na nuvem** (Vercel, Railway, etc.) — o sistema fica online 24h com um link fixo.
2. **Ou usar ngrok** — expõe temporariamente o localhost para a internet (útil para testes).

Se quiser, posso orientar o deploy na Vercel (gratuito) para ter um link permanente.
