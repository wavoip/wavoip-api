---
icon: mobile-button
---

# Dispositivo

### Acessando os dispositivos

Com a classe Wavoip instanciada, você poderá resgatar os dispositivos pela propriedade:

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

A função **wakeUp()** poderá ser usada para ligar o dispositivo caso ele entre em modo de hibernação [#hibernating](dispositivo.md#hibernating "mention")

### Vinculando um número de celular

{% hint style="info" %}
Se seu(s) dispositivo(s) já possui(em) um número vinculado, pule para a seção [#status-do-dispositivo](dispositivo.md#status-do-dispositivo "mention")
{% endhint %}

Para vincular um número é necessário ler o QRCode do dispositivo no celular. Para isso é possível usar duas abordagens.

1. Acessar o QRCode na [plataforma](https://www.npmjs.com/package/react-qrcode)&#x20;
2. Utilizar alguma biblioteca para renderizar QRCode a partir da propriedade **device.qrcode**. \
   Recomendamos [node-qrcode](https://www.npmjs.com/package/react-qrcode) para vanilla JS ou [react-qrcode](https://www.npmjs.com/package/react-qrcode) para projetos React

<pre class="language-typescript"><code class="lang-typescript"><strong>Device.qrcode: string | null
</strong></code></pre>

{% hint style="info" %}
Para saber se o número foi vinculado com sucesso ou não basta olhar o [#status-do-dispositivo](dispositivo.md#status-do-dispositivo "mention")
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

Não existe nenhum número vinculado ao dispositivo. Caso nenhum número seja vinculado o dispositivo poderá entrar em modo [#hibernating](dispositivo.md#hibernating "mention")

#### Connecting

QRCode pronto e esperando algum número ser vinculado. Caso nenhum número seja vinculado o dispositivo poderá entrar em modo [#hibernating](dispositivo.md#hibernating "mention")

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
A função retorna somente os dispositivos adicionados, para acessar todos dipositivos ver [#acessando-os-dispositivos](dispositivo.md#acessando-os-dispositivos "mention")
{% endhint %}

Para remover, basta chamar o **removeDevices()** passando os mesmos parâmetros. Essa função retorna os dispositivos que ficaram

```typescript
Wavoip.removeDevices(tokens: string[]): Device[]
```
