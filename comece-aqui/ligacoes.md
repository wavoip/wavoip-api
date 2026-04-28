---
icon: phone
---

# Ligações

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
Objeto herda propriedades do [#objeto-call](ligacoes.md#objeto-call "mention")
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

Para controlar a chamada ativa olhar seção [#controlando-uma-chamada](ligacoes.md#controlando-uma-chamada "mention")

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
Objeto herda propriedades do [#objeto-call](ligacoes.md#objeto-call "mention")
{% endhint %}

Aqui segue o mesmo raciocínio do [#aceitando-ofertas](ligacoes.md#aceitando-ofertas "mention"). Você pode escutar eventos e realizar ações

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

Ao aceitar uma oferta de chamada ( [#recebendo-ligacoes-incoming](ligacoes.md#recebendo-ligacoes-incoming "mention")) ou aceitarem uma chamada sua ( [#realizando-uma-ligacao-outgoing](ligacoes.md#realizando-uma-ligacao-outgoing "mention")) você receberá uma chamada Ativa

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
Objeto herda propriedades do [#objeto-call](ligacoes.md#objeto-call "mention")
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
