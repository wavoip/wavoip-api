---
description: Biblioteca baseada em WebSocket para integrar chamadas de áudio do WhatsApp em projetos web.
icon: phone
layout:
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---

# wavoip-api

`@wavoip/wavoip-api` gerencia todo o ciclo de vida de chamadas de áudio do WhatsApp — recebidas e realizadas — diretamente no navegador. Abstrai a sinalização via WebSocket (Socket.IO), o transporte de mídia (WebRTC nas chamadas oficiais, relay por WebSocket nas não oficiais) e o áudio local por trás de uma API tipada e orientada a eventos.

{% hint style="info" %}
**v3** — quebra compatibilidade com a v2. Se você vem de lá, comece por
[Migrando da v2 para a v3](migration.md).
{% endhint %}

## O que faz

* Conecta-se a um ou mais dispositivos Wavoip via WebSocket
* Recebe e despacha ofertas de chamadas recebidas
* Inicia chamadas com fallback automático entre dispositivos
* Lista os microfones e alto-falantes que a plataforma reporta
* Expõe eventos tipados para cada mudança de estado da chamada
* Devolve `{ data, error }` em tudo que pode falhar, com código de erro estável

## Início rápido

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({ tokens: ["seu-token-de-dispositivo"] })

// Receber chamadas
wavoip.on("offer", async (offer) => {
    const { data: call, error } = await offer.accept()
    if (error) return console.error(error.code)

    call.on("ended", () => console.log("O outro lado desligou"))
})

// Realizar chamadas
const { data: outgoing, error } = await wavoip.startCall({ to: "+5511999999999" })
if (!error) {
    outgoing.on("accepted", (active) => console.log("Chamada conectada!", active.id))
    outgoing.on("rejected", () => console.log("Recusada"))
}
```

## Explore a documentação

<table data-view="cards">
    <thead>
        <tr>
            <th>Seção</th>
            <th data-card-target data-type="content-ref">Link</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Instalação e configuração</td>
            <td><a href="getting-started/installation.md">Instalação</a></td>
        </tr>
        <tr>
            <td>Gerenciamento de dispositivos</td>
            <td><a href="device.md">Dispositivo</a></td>
        </tr>
        <tr>
            <td>Chamadas recebidas</td>
            <td><a href="calls/incoming.md">Chamadas Recebidas</a></td>
        </tr>
        <tr>
            <td>Chamadas realizadas</td>
            <td><a href="calls/outgoing.md">Chamadas Realizadas</a></td>
        </tr>
        <tr>
            <td>Controle de chamada ativa</td>
            <td><a href="calls/active.md">Chamada Ativa</a></td>
        </tr>
        <tr>
            <td>Dispositivos de áudio</td>
            <td><a href="media.md">Mídia</a></td>
        </tr>
    </tbody>
</table>
