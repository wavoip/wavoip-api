# Chamadas em Node.js

Dois exemplos: um que **atende** e outro que **liga**. Os dois tocam uma saudação, gravam a
conversa num `.wav` e percorrem o caminho inteiro do runtime de Node — diagnóstico, device,
áudio nas duas direções e desligamento.

O `@wavoip/wavoip-api` daqui é o do próprio repositório (`file:../..`), então o `dist/` tem
que existir: rode `pnpm build` na raiz antes do primeiro `npm install`.

```bash
npm install

WAVOIP_TOKEN=seu-token npm run answer              # atende quem ligar
WAVOIP_TOKEN=seu-token npm run dial -- 5511999999  # liga para um número
```

Sem token, os dois rodam só o diagnóstico e saem.

## Áudio de verdade, e conversão nos dois lados

O exemplo toca `audio/exemplo.wav`, que vem junto: áudio gravado, e não um tom sintetizado —
assim dá para julgar de ouvido se a chamada está boa. Qualquer um roda sem preparar nada.

Nenhuma das duas pontas está na taxa da chamada, de propósito:

| | Formato | O que exercita |
| --- | --- | --- |
| Entrada (`audio/exemplo.wav`) | **44,1 kHz estéreo** | misturar os canais e reamostrar para baixo, numa razão que não é inteira |
| Saída (`studioSink`) | **48 kHz** | reamostrar para cima — três vezes mais amostras por segundo |

Os 16 kHz da chamada ficam no meio. A saída é o lado caro: [o custo acompanha a taxa de
saída](../../docs/platforms/node.md), e 48 kHz é o triplo de 16 kHz.

Medido com o arquivo:

```
44,1 kHz estéreo → 16 kHz mono:  47.349 amostras em 3 s  (esperado 48.000)
pico do sinal:                   6.056 no arquivo → 5.968 depois  (98,5% preservado)
16 kHz → 48 kHz:                 2,96 s gravados de 3 s de chamada
```

{% hint style="info" %}
**Repare no tamanho do frame em `audio.ts`.** Num arquivo estéreo as amostras vêm
intercaladas, uma de cada canal, então um frame de 20 ms tem o dobro delas. Sem multiplicar
pelo número de canais, o áudio sai na metade da velocidade — e é o tipo de engano que um
arquivo mono nunca revelaria.
{% endhint %}

### Que arquivos dá para usar

```bash
WAVOIP_AUDIO=./minha-mensagem.wav npm run answer
```

O leitor aceita **qualquer WAV de PCM**, em qualquer taxa, mono ou estéreo:

| Profundidade | Lê |
| --- | --- |
| 8 bits sem sinal | ✅ |
| 16, 24 e 32 bits inteiros | ✅ |
| 32 e 64 bits em ponto flutuante | ✅ |
| `WAVE_FORMAT_EXTENSIBLE` (o cabeçalho de gravadores modernos) | ✅ |

**Formatos comprimidos não**: mp3, ogg, m4a e opus precisam ser decodificados, e decodificar
não é papel de um exemplo de telefonia. Converta antes:

```bash
ffmpeg -i musica.mp3 -c:a pcm_s16le saudacao.wav
```

O erro diz isso quando acontece, com o comando pronto.

Por isso os exemplos também ligam o worker:

```typescript
nodeRuntime({ source, sink, resampleInWorker: true })
```

Com uma chamada só isso é exagero — é a partir de algumas dezenas simultâneas que a
reamostragem começa a segurar o event loop. Está ligado para mostrar onde fica a opção.

## O trace: a chamada narrada linha por linha

Os dois exemplos contam tudo o que acontece, com o tempo desde o início na frente — e é o
tempo que responde onde a chamada travou:

```
   0.1s device  status BUILDING · conexão disconnected
   0.4s device  conexão → connected
   0.4s device  status → open
   0.4s call    discando para 5511999999999
   2.9s ice     coleta 2500ms (esgotou o tempo) · host 1 srflx 0 prflx 0 relay 0 · stun não alcançado · turn não usado · sem par escolhido
   2.9s ice     problema: ICE_GATHERING_TIMEOUT
   2.9s ice     problema: STUN_UNREACHABLE
   3.0s call    call-abc123 · OFFICIAL · para 5511999999999 · status RINGING
  11.2s call    atendida depois de 11.2s de toque
  11.3s media   OFFICIAL · conexão connected
  12.3s áudio   saída [#######   ]  35%   entrada [          ]   0%
  12.3s rede    rtt 42ms · tx 312 pac / 0 perd / 24 kbps · rx 0 pac / 0 perd / 0 kbps · jitter 0ms
```

Como ler:

| O que aparece | O que significa |
| --- | --- |
| `ice · srflx 0` | o STUN não devolveu candidato público: sem ele o outro lado não tem para onde mandar áudio, e a chamada oficial não conecta |
| `ice · esgotou o tempo` | a coleta passou de 2,5 s e a biblioteca seguiu com o que tinha; o `iceConfig.gatheringTimeoutMs` do construtor do `Wavoip` aumenta esse teto |
| `ice · problema: ICE_CONNECTION_FAILED` | os candidatos foram trocados e nenhum par funcionou — normalmente NAT simétrico das duas pontas, que só um TURN resolve |
| `áudio · saída 0%` | o problema é a **fonte**: o arquivo não está sendo lido |
| `áudio` andando e `rede · tx 0 pac` | a fonte está boa e a **rede** não passa; a resposta está nas linhas de `ice` acima |
| `rede · rx 0 pac` com `tx` andando | você manda e não recebe: a mídia do outro lado não chegou |

Se o `ICE_GATHERING_TIMEOUT` aparecer, é porque o STUN não respondeu dentro do teto — e aí o
`WAVOIP_ICE_TIMEOUT` dá mais tempo:

```bash
WAVOIP_ICE_TIMEOUT=6000 WAVOIP_TOKEN=... npm run dial -- 5511999999999
```

O teto padrão é 2,5 s, mas a coleta normalmente acaba muito antes: meio segundo sem candidato
novo, depois de o STUN ter respondido, já encerra ([por que](../../docs/platforms/node.md)).

O diagnóstico de ICE aparece **mesmo quando a chamada não conecta** — a coleta de candidatos
acontece antes de a chamada existir, e a biblioteca guarda o resultado para quem for observar
depois.

## Os arquivos

| Arquivo | O que demonstra |
| --- | --- |
| `src/answer.ts` | atender uma oferta, acompanhar a chamada, gravar ao desligar |
| `src/dial.ts` | `startCall`, os eventos da chamada que sai, desistir por tempo |
| `src/shared.ts` | montar o runtime, rodar o diagnóstico, conectar o device |
| `src/trace.ts` | narrar a chamada: eventos, ICE, níveis e pacotes |
| `src/audio.ts` | as duas pontas de áudio, cada uma numa taxa diferente da chamada |
| `src/wav.ts` | ler e escrever WAV, mono ou estéreo, sem nenhuma dependência |

## O que reparar no código

**A gravação tem os dois lados.** O `sink` é só o que o contato falou; o `outgoingSink` traz
uma cópia do que você mandou. O exemplo grava em dois canais — esquerda você, direita o
contato —, separados em vez de misturados para dar para ouvir cada um sozinho depois.

**O áudio é seu, dos dois lados.** Num processo sem cabeça não há microfone nem alto-falante:
você entrega um `source` e um `sink`, declara o formato, e a biblioteca converte. A fonte do
exemplo não converte nada — ela diz `sampleRate: 22050` e entrega as amostras como estão.

**O diagnóstico vem antes da primeira chamada.** Num servidor ninguém vê o STUN bloqueado por
um firewall — a chamada simplesmente não completaria, e o log não diria por quê.

**Quando `startCall` falha, `error.devices` diz o porquê de cada device**, e é isso que
distingue "o número não existe" de "o seu device está desconectado".

**Desistir é decisão sua.** O `dial.ts` cancela depois de 45 s: sem isso o processo ficaria
tocando até o outro lado resolver alguma coisa.

**O estouro é olhado durante a chamada**, e não só no diagnóstico: o ganho pode mudar no meio,
e quem fala nunca percebe que está distorcendo — só quem ouve.

## Requisitos

- Node 22 ou mais novo (o `--experimental-strip-types` roda o TypeScript direto)
- `@roamhq/wrtc` para a chamada oficial e `ws` para a não oficial

Nada além disso: o WAV é lido e escrito em JavaScript puro, sem `ffmpeg` nem módulo nativo de
áudio.
