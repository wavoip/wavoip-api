# Bot de chamadas em Node.js

Um bot que atende chamadas, toca uma saudação e grava o que o contato falou num `.wav`.

É o menor exemplo que percorre o caminho inteiro do runtime de Node: diagnóstico do ambiente,
conexão com o device, oferta recebida, áudio nas duas direções e desligamento.

## Rodar

```bash
npm install
WAVOIP_TOKEN=seu-token npm start
```

Sem token, ele roda só o diagnóstico e sai.

```
 ✓ AUDIO_RUNNING
 ✓ WEBRTC_AVAILABLE
 ✓ BINARY_SOCKET_AVAILABLE
 ✓ STUN_REACHABLE { reachable: 2, probed: 2, … }
esperando chamada… (ctrl+c para sair)
```

Ligue para o número do device. O bot atende, toca três notas e grava; ao desligar, salva
`chamada-<timestamp>.wav` na pasta atual.

## O que cada arquivo mostra

| Arquivo | O que demonstra |
| --- | --- |
| `src/bot.ts` | montar o runtime, rodar o diagnóstico, atender e acompanhar a chamada |
| `src/audio.ts` | as duas pontas de áudio: de onde sai e para onde vai |
| `src/wav.ts` | transformar o PCM da chamada num arquivo tocável |

## O que reparar no código

**O áudio é seu, dos dois lados.** Num processo sem cabeça não há microfone nem alto-falante:
você entrega um `source` e um `sink`, e a biblioteca não presume mais nada.

```typescript
const runtime = nodeRuntime({ source: greetingSource(), sink: recordingSink() })
```

**A saudação já sai em 16 kHz**, então o exemplo não declara `sampleRate` e nada é
reamostrado. Se o seu áudio vier de um MP3 a 44,1 kHz, declare a taxa e a biblioteca converte
— veja [a documentação de Node](../../docs/platforms/node.md).

**O diagnóstico vem antes da primeira chamada.** Num servidor ninguém vê o STUN bloqueado por
um firewall: a chamada simplesmente não completaria, e o log não diria por quê.

**O estouro é olhado durante a chamada**, e não só no início: o ganho do outro lado pode mudar
no meio, e quem fala nunca percebe que está distorcendo.

## Requisitos

- Node 22 ou mais novo (o `--experimental-strip-types` roda o TypeScript direto)
- `@roamhq/wrtc` para a chamada oficial e `ws` para a não oficial
