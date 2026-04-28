---
description: Configurando um Tronco Wavoip no FreePBX
---

# FreePBX

## Adicionar um tronco

1.  Acesse o painel FreePBX pelo navegador e realize o login com usuário administrador.&#x20;

    <div align="left"><figure><img src="../.gitbook/assets/image (2).png" alt=""><figcaption></figcaption></figure></div>
2.  No menu superior, clique em Conectividade > Troncos.                                                  &#x20;

    <div align="left"><figure><img src="../.gitbook/assets/image (7).png" alt=""><figcaption></figcaption></figure></div>
3.  Clique em Adicionar Tronco > Adicionar tronco SIP (chan\_pjsip).

    <div align="left"><figure><img src="../.gitbook/assets/image (8).png" alt=""><figcaption></figcaption></figure></div>
4.  Na aba Geral, preencha conforme orientações:                        &#x20;

    <figure><img src="../.gitbook/assets/image (9).png" alt=""><figcaption></figcaption></figure>
5. Na aba pjsip Configurações (Geral), preencha:

* Nome do usuário: (Digite seu usuário SIP WAVOIP)
* Auth username: (Digite novamente seu usuário SIP WAVOIP)
* Senha: (Digite sua senha SIP WAVOIP)
* Servidor sip: sipv2.wavoip.com
*   Demais informações conforme a imagem abaixo:                              &#x20;

    <figure><img src="../.gitbook/assets/image (10).png" alt=""><figcaption></figcaption></figure>

Obs: Os demais campos permanecem inalterados.\
6\. Na aba pjsip Configurações (Avançado):

*   Do usuário: (Digite novamente o usuário SIP)                           &#x20;

    <figure><img src="../.gitbook/assets/image (11).png" alt=""><figcaption></figcaption></figure>

Obs: Os demais campos permanecem inalterados.\
7\. Clique em Enviar                                                                                           &#x20;

<div align="left"><figure><img src="../.gitbook/assets/image (13).png" alt=""><figcaption></figcaption></figure></div>



## Adicionar Rota de Entrada

1.  Clique em Adicionar Rota de Entrada.                                                                      &#x20;

    <div align="left"><figure><img src="../.gitbook/assets/image (12).png" alt=""><figcaption></figcaption></figure></div>

### Aba Geral:

* Descrição: Nome à sua escolha
* Número DID: Deixar em branco (qualquer número)
*   Configurar Destino: Selecione destino desejado (filas, ramais, URA)&#x20;

    <figure><img src="../.gitbook/assets/image (14).png" alt=""><figcaption></figcaption></figure>

Obs: Os demais campos não serão alterados.\
Clique em Enviar.                                                                                             &#x20;

<div align="left"><figure><img src="../.gitbook/assets/image (15).png" alt=""><figcaption></figcaption></figure></div>



## Configuração de Rota de Saída

1.  Acesse Conectividade > Rotas de Saída                                                                       &#x20;

    <div align="left"><figure><img src="../.gitbook/assets/image (16).png" alt=""><figcaption></figcaption></figure></div>

### Aba Configurações de Rota:

* Nome da Rota: Nome à sua escolha
* Sequência de troncos: Selecione o tronco criado (Wavoip)
*   Destino opcional em congestionamento: Congestionamento Normal

    <figure><img src="../.gitbook/assets/image (17).png" alt=""><figcaption></figcaption></figure>

### Aba Padrão de Discagem:

*   Adicione m match pattern exatamente da seguinte maneira: X. (LETRA X E UM PONTO)

    <figure><img src="../.gitbook/assets/image (18).png" alt=""><figcaption></figcaption></figure>

Clique em Enviar.                                                                                              &#x20;

<div align="left"><figure><img src="../.gitbook/assets/image (19).png" alt=""><figcaption></figcaption></figure></div>

Verificação do Registro do Tronco

1.  Acesse Administrador > CLI Asterisk                                                                   &#x20;

    <div align="left"><figure><img src="../.gitbook/assets/image (20).png" alt=""><figcaption></figcaption></figure></div>
2. Digite o comando:   \
   `pjsip show registrations`
3.  Clique em Send Command para verificar o status de registro.

    <figure><img src="../.gitbook/assets/image (21).png" alt=""><figcaption></figcaption></figure>
