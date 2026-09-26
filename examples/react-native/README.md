# Chamadas em React Native

Uma tela: conectar o device, ligar para um número, atender o que chega. Medidor de nível nas
duas direções, mudo, viva-voz, e um log na tela — num aparelho de verdade ninguém tem o Metro
aberto ao lado quando a chamada se comporta mal.

> **Este é o código do app, e não um app pronto.** Ele não traz as pastas `android/` e `ios/`,
> que são geradas e pesam mais que o resto do repositório junto. Os passos abaixo criam o app e
> colocam estes arquivos dentro dele.

## Rodar

### 1. Criar o app

```bash
npx @react-native-community/cli init WavoipExemplo
cd WavoipExemplo
```

### 2. Instalar a biblioteca e os pares nativos

```bash
npm install @wavoip/wavoip-api react-native-webrtc react-native-incall-manager react-native-audio-api
cd ios && pod install && cd ..
```

O `react-native-incall-manager` não é opcional na prática: sem ele o iOS toca a chamada na
categoria `Ambient`, que obedece ao botão de silencioso — a chamada conecta, os pacotes chegam,
e ninguém ouve nada. A biblioteca chama o `InCallManager` no momento certo; você só instala.

### 3. Copiar os arquivos

```bash
cp -r <este-diretório>/App.tsx <este-diretório>/src .
```

O `index.js` que o CLI gerou já importa o `App`, então não há mais nada a ligar.

### 4. Declarar a permissão de microfone

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

`ios/WavoipExemplo/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Para falar nas chamadas</string>
```

Quem **pede** a permissão em tempo de execução é o app, não a biblioteca — no Android com
`PermissionsAndroid.request`, no iOS na primeira captura. O diagnóstico da primeira tela mostra
`MICROPHONE_PERMISSION_DENIED` enquanto ela não vier.

### 5. Subcaminho no Metro

O import `@wavoip/wavoip-api/react-native` depende do campo `exports` do `package.json`, que o
Metro lê a partir do React Native 0.79. Em versões anteriores, ligue à mão:

```javascript
// metro.config.js
module.exports = { resolver: { unstable_enablePackageExports: true } }
```

### 6. Rodar num aparelho

```bash
npx react-native run-android   # ou run-ios
```

Emulador não serve para julgar áudio: use um aparelho.

O token é digitado na tela, e não fica no código — este repositório é público.

## Os arquivos

| Arquivo | O que demonstra |
| --- | --- |
| `App.tsx` | a tela inteira: token, discagem, oferta, chamada de pé |
| `src/useSession.ts` | rodar o diagnóstico, conectar o device, acompanhar o que ele conta |
| `src/useCall.ts` | uma fase, um objeto: oferta, chamada que sai, chamada ativa |
| `src/Meter.tsx` | ler o nível do áudio nas duas direções |
| `src/trace.ts` | o log na tela, alimentado pelos eventos da biblioteca |

## O que reparar no código

**Uma fase, um objeto.** O `CallPhase` do `useCall.ts` é uma união: `offer`, `outgoing`,
`active`. É o desenho da própria biblioteca — ela entrega um objeto diferente por fase, cada um
com só os métodos que fazem sentido ali. Nada de um objeto de chamada com campos que valem em
algumas fases e em outras não.

**O diagnóstico vem antes da primeira chamada.** Ele é o que separa "falta permissão de
microfone" de "a chamada não completou", e num celular essa diferença não é óbvia.

**O nível é síncrono.** `call.audio.in.level()` responde na hora, então dá para lê-lo num
intervalo curto sem esperar Promise. É a primeira coisa a olhar quando o outro lado diz que não
ouve nada.

**O viva-voz é uma saída como outra qualquer.** `wavoip.audio.selectOutput("speaker")` ou
`"earpiece"`, com os ids que `listOutputDevices()` reporta. Escolher o **microfone** não existe
aqui: `selectInput` devolve `INPUT_SELECTION_UNSUPPORTED`, porque no Android e no iOS quem
decide é o sistema.

**Você não precisa do `registerGlobals()`.** O runtime recebe as implementações por injeção, e
nenhum global do navegador é lido.

## O que não foi executado num aparelho

Este exemplo compila contra os tipos publicados da biblioteca e contra os do
`react-native-webrtc`, e o `npm run typecheck` prova isso. **Rodar num Android e num iPhone de
verdade ainda não aconteceu** — nem para o exemplo, nem para o adaptador que ele usa. Trate os
dois como prontos para serem testados, e não como prontos para produção.

O que precisa ser medido num aparelho está listado em
[`docs/platforms/react-native.md`](../../docs/platforms/react-native.md): se a taxa pedida ao
`AudioRecorder` é honrada, a latência do caminho até a track, e o comportamento da sessão de
áudio no iOS quando a chamada chega com o app em segundo plano.
