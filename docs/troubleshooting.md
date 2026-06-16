---
description: Catálogo de problemas de conectividade emitidos pelo evento connectivityIssue e como investigá-los.
icon: bug
---

# Solução de Problemas

`@wavoip/wavoip-api` expõe o evento `connectivityIssue` em `Offer`, `CallOutgoing` e `CallActive`. Cada valor identifica uma classe de falha detectada durante a coleta ICE ou ao longo da chamada e ajuda a direcionar a investigação.

```typescript
call.on("connectivityIssue", (issue) => {
    console.warn(issue)
})
```

## Códigos

### `STUN_UNREACHABLE`

Nenhum dos servidores STUN configurados respondeu durante a coleta ICE.

**Possíveis causas**

* Firewall ou proxy corporativo bloqueando UDP nas portas STUN (3478, 19302).
* DNS interno sem resolver os endereços `stun:*` configurados.
* Conectividade local sem saída para a Internet.

**O que investigar**

* Rodar `runStunProbe(servers)` para confirmar quais servidores estão acessíveis.
* Conferir se a rede do usuário usa um proxy que precisa de whitelisting.
* Verificar se os servidores STUN customizados (caso passados via `iceServers`) estão respondendo.

### `ICE_GATHERING_TIMEOUT`

A coleta de candidatos ICE excedeu o `gatheringTimeoutMs` configurado e a chamada seguiu com o que havia sido coletado até então.

**Possíveis causas**

* Servidores STUN/TURN lentos.
* Rede de alta latência.
* Restrições do navegador (ex: rede privada com limitações).

**O que investigar**

* Conferir `IceDiagnostics.gatheringDurationMs` e `candidatesByType` no payload do evento `iceDiagnostics` que precede.
* Aumentar `gatheringTimeoutMs` se a infraestrutura legitimamente demora a responder.

### `ICE_CONNECTION_FAILED`

A negociação ICE falhou em estabelecer um par válido entre os endpoints e a mídia não fluiu.

**Possíveis causas**

* NAT simétrico em ambas as pontas sem TURN disponível.
* Servidores TURN não configurados ou inacessíveis.
* Bloqueio de UDP em toda a rede sem fallback para TCP/TURN.

**O que investigar**

* Verificar se os servidores TURN configurados em `iceServers` aceitam credenciais válidas.
* Avaliar o uso de TURN com transporte TCP como fallback.
* Conferir `IceDiagnostics.selectedCandidatePair` em chamadas que funcionam para entender o caminho esperado.

### `NO_HOST_CANDIDATES`

Nenhum candidato local (`host`) foi descoberto durante a coleta ICE.

**Possíveis causas**

* mDNS desabilitado no navegador (Chrome → `chrome://flags`).
* Conexão por VPN que oculta interfaces locais.
* Política do navegador que esconde IPs locais (ex: "Anonymize local IPs exposed by WebRTC").

**O que investigar**

* Pedir ao usuário para desativar a flag de anonimização no navegador.
* Reproduzir fora da VPN para isolar a causa.

### `SYMMETRIC_NAT_SUSPECTED`

A heurística detectou padrões de NAT simétrico, que tendem a impedir conexão peer-to-peer direta.

**Possíveis causas**

* Roteador/operadora aplicando NAT simétrico.
* Múltiplas camadas de NAT (CGNAT).

**O que investigar**

* Garantir que servidores TURN estão configurados — chamadas com NAT simétrico costumam só funcionar via relay.
* Conferir o tipo de candidato selecionado em `IceDiagnostics.selectedCandidatePair` (geralmente `relay`).

## Como o Webphone usa esses códigos

A tela **Diagnóstico** do `@wavoip/wavoip-webphone` registra cada `connectivityIssue` em **Problemas recentes** (com o `id` da chamada) e exibe um banner traduzido durante a chamada com link direto para a tela.
