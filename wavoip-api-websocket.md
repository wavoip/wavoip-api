---
icon: code
---

# wavoip-api (Websocket)

{% hint style="warning" %}
Ao conectar no dispositivo usando essa biblioteca, o dispositivo será atualizado para versão nova automaticamente
{% endhint %}

## Introdução

Essa biblioteca foi feita com o intuito de facilitar a utilização dos dispositivos da Wavoip por meio de websockets. Ela abstrai toda comunicação de eventos entre o cliente e o dispositivo, além de toda parte de áudio de chamadas

Como a comunicação de websockets se dá por meio de eventos, a biblioteca foi feita para ser utilizada por meio callbacks.

## Instalação

Instale a biblioteca utilizando seu gerenciador de dependências favorito

{% tabs %}
{% tab title="PNPM" %}
```bash
pnpm add @wavoip/wavoip-api
```
{% endtab %}

{% tab title="NPM" %}
```bash
npm install @wavoip/wavoip-api
```
{% endtab %}
{% endtabs %}

## Classe Wavoip

Instancie a classe Wavoip e passe os tokens de seus dispositivos como parâmetros

{% hint style="info" %}
É possível adicionar ou remover tokens de dispositivos após a classe ser instanciada&#x20;
{% endhint %}

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({
    tokens: ["token 1", "token 2", ...]
})
```

***

## Dispositivos

### Acessando os dispositivos

Com a classe instânciada, você poderá resgatar os dispositivos pela propriedade:

```typescript
Wavoip.devices: Device[]
```

&#x20;Cada dispositivo possui as seguintes propriedades:&#x20;

```typescript
type Device = {
    token: string;
    status: DeviceStatus | null;
    qrcode: string | null;
    contact: DeviceContacts
    onStatus(cb: (status: DeviceStatus | null) => void): void;
    onQRCode(cb: (qrcode: string) => void): void;
    onContact(cb: (type: CallType, contact: Contact | null) => void): void;
    restart(): Promise<string | null>
    logout(): Promise<string | null>;
    wakeUp(): Promise<DeviceAllInfo | null>;
    pairingCode(phone: string): Promise<{ pairingCode: string; err: null } | { pairingCode: null; err: string }>;
    delete(): void;
};
```

Tanto a propriedade **status**, quanto **qrcode** serão atualizadas em tempo real via websocket, e, ao serem atualizadas, chamarão seus respectivos callbacks. Estes callbacks podem ser definidos ao chamar o **onStatus()** e o **onQRCode()** passando uma função como parâmetro.

A função **wakeUp()** poderá ser usada para ligar o dispositivo caso ele entre em modo de hibernação [#hibernating](wavoip-api-websocket.md#hibernating "mention")

### Vinculando um número de celular

{% hint style="info" %}
Se seu(s) dispositivo(s) já possui(em) um número vinculado, pule para a seção [#status-do-dispositivo](wavoip-api-websocket.md#status-do-dispositivo "mention")
{% endhint %}

Para vincular um número é necessário ler o QRCode do dispositivo no celular. Para isso é possível usar duas abordagens.

1. Acessar o QRCode na [plataforma](https://www.npmjs.com/package/react-qrcode)&#x20;
2. Utilizar alguma biblioteca para renderizar QRCode a partir da propriedade **device.qrcode**. \
   Recomendamos [node-qrcode](https://www.npmjs.com/package/react-qrcode) para vanilla JS ou [react-qrcode](https://www.npmjs.com/package/react-qrcode) para projetos React

<pre class="language-typescript"><code class="lang-typescript"><strong>Device.qrcode: string | null
</strong></code></pre>

{% hint style="info" %}
Para saber se o número foi vinculado com sucesso ou não basta olhar o [#status-do-dispositivo](wavoip-api-websocket.md#status-do-dispositivo "mention")
{% endhint %}

### Status do dispositivo

O dispositivo pode possuir os seguintes status:

```typescript
type DeviceStatus =
    | "disconnected"
    | "close"
    | "connecting"
    | "open"
    | "restarting"
    | "hibernating"
    | "BUILDING"
    | "EXTERNAL_INTEGRATION_ERROR";

```

#### Disconnected

O websocket do navegador perdeu conexão com o dispositivo. Normalmente o websocket reconectar ao dispositivo automaticamente

#### Close

Não existe nenhum número vinculado ao dispositivo. Caso nenhum número seja vinculado o dispositivo poderá entrar em modo [#hibernating](wavoip-api-websocket.md#hibernating "mention")

#### Connecting

QRCode pronto e esperando algum número ser vinculado. Caso nenhum número seja vinculado o dispositivo poderá entrar em modo [#hibernating](wavoip-api-websocket.md#hibernating "mention")

#### Open

Pronto para realizar chamadas

#### Restarting&#x20;

O dispositivo está esperando as chamadas ativas terminarem para reiniciar. Nenhuma nova chamada poderá ser feita&#x20;

#### Hibernating

Caso o dispositivo não seja vinculado a um número dentro de 2 minutos e 30 segundos, ele entrará em modo de hibernação e receberá o status **"hibernating"**. Para reativá-lo, basta chamar a função **powerOn()** do dispositivo

#### Building

O dispositivo foi inicializado e está em processo de construção. Nenhuma chamada poderá ser feita

#### EXTERNAL\_INTEGRATION\_ERROR

Ocorreu algum erro ao usar uma integração externa e o dispositivo não consegue se recuperar (Necessário reiniciar)

### Adicionando ou removendo dispositivos

Para adicionar novos dispositivos a instância basta chamar o **addDevices()** passando os tokens como parâmetro

<pre class="language-typescript"><code class="lang-typescript"><strong>Wavoip.addDevices(tokens: string[]): Device[]
</strong></code></pre>

{% hint style="info" %}
A função retorna somente os dispositivos adicionados, para acessar todos dipositivos ver [#acessando-os-dispositivos](wavoip-api-websocket.md#acessando-os-dispositivos "mention")
{% endhint %}

Para remover, basta chamar o **removeDevices()** passando os mesmos parâmetros. Essa função retorna os dispositivos que ficaram

```typescript
Wavoip.removeDevices(tokens: string[]): Device[]
```

***

## Objeto Call

Todas chamadas, ofertas (incoming) e saintes (outgoing) herdarão as propriedades desse objeto

```typescript
type Call = {
    id: string;
    type: "official" | "unofficial"
    device_token: string;
    direction: "INCOMING" | "OUTGOING";
    status: "RINGING" | "CALLING" | "NOT_ANSWERED" | "ACTIVE" | "ENDED" | "REJECTED" | "FAILED" | "DISCONNECTED" | "DEVICE_RESTARTING",
    peer: {
        phone: string;
        displayName: string | null;
        profilePicture: string | null;
        muted: boolean;
    };
    muted: boolean;
}
```

* **id:** Cada chamada possui um ID único
* **device\_token:** Qual dispositivo a chamada veio
* **direction:** Ofertas de chamada (INCOMING), chamadas saintes (OUTGOING)
* **status:** Status atual da chamada
* **peer:** Objeto representando o outro participante da chamada
* **muted:** Se você está mutado

***

## Recebendo ligações (Incoming)

Para receber ofertas de chamadas (incoming) é necessário definir um callback para a função **onOffer()** da sua instância

```typescript
Wavoip.onOffer((offer: CallOffer) => {
    // faça algo
})
```

O callback receberá um objeto do tipo **CallOffer**

```typescript
type CallOffer = Call & {
    accept(): Promise<{ call: CallActive; err: null} | { call: null, err: string }>;
    reject(): Promise<{ err: string | null;}>;
    onAcceptedElsewhere(cb: () => void): void;
    onRejectedElsewhere(cb: () => void): void;
    onUnanswered(cb: () => void): void;
    onEnd(cb: () => void): void;
    onStatus(cb: (status: CallStatus) => void): void;
};
```

{% hint style="info" %}
Objeto herda propriedades do [#objeto-call](wavoip-api-websocket.md#objeto-call "mention")
{% endhint %}

Com esse objeto você poderá aceitar, rejeitar e escutar alguns eventos de uma oferta de chamada

> **onAcceptedElsewhere:** Outro cliente conectado no mesmo dispositivo aceitou essa oferta. Ela não pode mais ser aceita
>
> **onRejectedElsewhere:** Outro cliente conectado rejeitou essa oferta.
>
> **onUnanswered:** A oferta terminou sem ser aceita ou rejeitada
>
> **onEnd:** Callback que será chamada ao fim de eventos negantes (onRejectedElsewhere, onUnanswered)

### Aceitando ofertas

Ao aceitar uma chamada com **offer.accept()** a função retornará uma promise

```typescript
CallOffer.accept(): Promise<
    | { call: CallActive; err: null} 
    | { call: null, err: string }
>;
```

Desse modo vc poderá verificar se conseguiu aceitar a chamada com sucesso usando a forma que achar mais apropriada. Exemplo:

```typescript
CallOffer.accept().then(({ call, err }) => {
    if(err) {
        // Faça algo em relação ao erro
        return
    }
    
    // Faça algo com a call
})
```

Para controlar a chamada ativa olhar seção [#controlando-uma-chamada](wavoip-api-websocket.md#controlando-uma-chamada "mention")

### Rejeitando ofertas

A lógica é a mesma de aceitar uma chamada. A função **offer.reject()** retorna uma promise

```typescript
CallOffer.reject(): Promise<{ err: string | null}>;
```

Exemplo de tratativa:&#x20;

```typescript
CallOffer.reject().then(({ err }) => {
    if(err) {
        // Faça algo em relação ao erro
        return
    }
    
    // Faça algo com a call
})
```

***

## Realizando uma ligação (Outgoing)

### Por meio de uma função assíncrona

Como as ligações funcionam por meio de websockets, sua utilização é por meio de eventos. Dessa forma, a biblioteca foi pensada para ser usada por meio de callbacks para esses eventos.

Para realizar uma ligação, basta chamar a função **startCall()** e passar um objeto de parâmetros. Nesses parâmetro será indicado para quem será a ligação e alguns callbacks

```typescript
Wavoip.startCall({
    to: string;
    fromTokens?: string[];
}): Promise<
    | { call: CallOutgoing; err: null }
    | { 
        call: null; 
        err: { message: string; devices: { token: string; reason: string }[]
      }
>
```

> **to:** Número de telefone que irá ligar
>
> **fromTokens:** Quais dispositivos deverão ser utilizados para ligar

{% hint style="info" %}
Caso não passe nada ou uma array vazia para o **fromTokens** a instância tentará ligar em todos dispositivos
{% endhint %}

A função retornará uma chamada sainte (outgoing) caso consiga ligar ou uma array indicando o erro em cada dispositivo no qual foi tentado ligar. Exemplo:

```typescript
Wavoip.startCall({ 
    to: "00999998888", 
    fromTokens: ["token1", "token2"]
}).then(({ call, err }) => {
    if(err) {
        // Faça algo
        return
    }
    
    // Continue com a chamada
})
```

### Por meio de um _Generator_ assíncrono

Existe uma maneira de realizar uma chamada e tratar as falhas dos dispositivos de modo iterativo com um [generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator) chamando o **startcalliterator()**

```typescript
for await (const result of Wavoip.startcalliterator({ to: "5511999999999" })) {
  if (result.err) {
   // Trate o erro
  } else {
   // Trate a chamada
  }
}

```

### Controlando uma chamada outgoing

Uma chamada sainte possui a seguinte estrutura

```typescript
type CallOutgoing = Call & {
    onPeerAccept(cb: (call: CallActive) => void): void;
    onPeerReject(cb: () => void): void;
    onUnanswered(cb: () => void): void;
    onEnd(cb: () => void): void;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    onStatus(cb: (status: CallStatus) => void): void;

};
```

{% hint style="info" %}
Objeto herda propriedades do [#objeto-call](wavoip-api-websocket.md#objeto-call "mention")
{% endhint %}

Aqui segue o mesmo raciocínio do [#aceitando-ofertas](wavoip-api-websocket.md#aceitando-ofertas "mention"). Você pode escutar eventos e realizar ações

> **onPeerAccept:** Chamada foi aceita pelo outro lado
>
> **onPeerReject:** Chamada foi rejeitada pelo outro lado
>
> **onUnanswered:** O outro lado não respondeu nada
>
> **onEnd:** Callback final para eventos negantes (onPeerReject, onUnanswered)

Todas ações retornam promises que podem resultar em um erro ou não, trate-as como achar melhor

Quando o outro lado aceitar a chamada, o evento **onPeerAccept** será chamado e você terá em mãos uma chamada ativa

***

## Controlando uma Chamada Ativa

Ao aceitar uma oferta de chamada ( [#recebendo-ligacoes-incoming](wavoip-api-websocket.md#recebendo-ligacoes-incoming "mention")) ou aceitarem uma chamada sua ( [#realizando-uma-ligacao-outgoing](wavoip-api-websocket.md#realizando-uma-ligacao-outgoing "mention")) você receberá uma chamada Ativa

```typescript
type CallActive = Call & {
    connection_status: "disconnected" | "connected" | "connecting";
    audio_analyser: Promise<AnalyserNode>;
    mute(): Promise<{ err: string | null }>;
    unmute(): Promise<{ err: string | null }>;
    end(): Promise<{ err: string | null }>;
    onError(cb: (err: string) => void): void;
    onPeerMute(cb: () => void): void;
    onPeerUnmute(cb: () => void): void;
    onEnd(cb: () => void): void;
    onStats(cb: (stats: CallStats) => void): void;
    onConnectionStatus(callback: (status: TransportStatus) => void): void;
    onStatus(cb: (status: CallStatus) => void): void;
};
```

{% hint style="info" %}
Objeto herda propriedades do [#objeto-call](wavoip-api-websocket.md#objeto-call "mention")
{% endhint %}

Seguimos com o mesmo raciocínio de eventos para serem escutados e ações a serem tomadas

> **onPeerMute:** O outro lado se mutou
>
> **onPeerUnmute:** O outro lado se desmutou
>
> **onError:** Ocorreu algum erro durante a chamada
>
> **onEnd:** A chamada foi finalizada
>
> **onStats:** Foi recebida estatisticas da chamada

Todas ações retornam promises que podem resultar em um erro ou não, trate-as como achar melhor



### Controlador de entrada e saída de áudio

A classe Wavoip tem um método que permite que você troque o dispositivo de áudio que está ativo, exemplo troca a saída de áudio isso permite que o usuário no meio da ligação ou antes de estabelecer a ligação troque a saída ou a entrada de áudio a partir de 3 funções

Obs: os dispositivos de áudio são salvo em Local Storage, ou seja a configuração é salva e carregada automaticamente na próxima chamada &#x20;

```typescript
// Permite que você liste os dispositivos de áudios disponíveis
(method) Wavoip.getMultimediaDevices(): {
    microphones: MultimediaDevice[];
    speakers: MultimediaDevice[];
}

// A partir da listagem dos dispositivos de áudio, edite a entrada do microfone ativa
(method) Wavoip.setAudioInputDevice(deviceId: string): Promise<void>

// A partir da listagem dos dispositivos de áudio, edite a saída do alto falante ativo
(method) Wavoip.setAudioOutputDevice(deviceId: string): Promise<void>
```

### Analisando o áudio de uma chamada

Toda chamada ative possui uma promise que resulta em um [AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode). Esse objeto serve para fazer a análise do áudio de uma chamada e possibilita, por exemplo, criar efeitos visuais em relação ao volume da voz.

### Estatísticas da chamada

Ao entrar em uma chamada você receberá algumas estatísticas pelo evento **onStats**

```typescript
export type CallStats = {
    rtt: {
        client: {
            min: number;
            max: number;
            avg: number;
        };
        whatsapp: {
            min: number;
            max: number;
            avg: number;
        };
    };
    tx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
    rx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
};
```

#### RTT

_Round Time Trip,_ ou mais comument chamado de ping. Você terá o ping entre o navegador e o dispositivo (rtt.client) e do dispositivo ao Whatsapp (rtt.whatsapp)

#### TX

Quantidade de pacotes de áudio enviados e perdidos

#### RX

Quantidade de pacotes de áudio recebidos e perdidos
