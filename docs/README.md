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

`@wavoip/wavoip-api` gerencia todo o ciclo de vida de chamadas de áudio do WhatsApp — recebidas e realizadas — diretamente no navegador. Abstrai a sinalização via WebSocket (Socket.IO), transporte de mídia via WebRTC e o gerenciamento de dispositivos de áudio por trás de uma API simples orientada a eventos.

{% hint style="info" %}
Versão **2.2.0** — suporta chamadas do tipo oficial (WebRTC) e não oficial (relay via WebSocket).
{% endhint %}

## O que faz

* Conecta-se a um ou mais dispositivos Wavoip via WebSocket
* Recebe e despacha ofertas de chamadas recebidas
* Inicia chamadas com fallback automático entre dispositivos
* Gerencia seleção de microfone e alto-falante com suporte a troca a quente
* Expõe eventos tipados para cada mudança de estado da chamada

## Início rápido

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({ tokens: ["seu-token-de-dispositivo"] })

// Receber chamadas
wavoip.on("offer", async (offer) => {
    const { call } = await offer.accept()
    if (!call) return

    call.on("ended", () => console.log("Chamada encerrada"))
})

// Realizar chamadas
const { call, err } = await wavoip.startCall({ to: "+5511999999999" })
if (call) {
    call.on("peerAccept", (active) => {
        console.log("Chamada conectada!")
    })
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
