---
icon: phone
---

# Webphone

## Introdução

Essa biblioteca foi feita com o intuito de facilitar a realização de ligações por dispositivos da Wavoip. Ela disponibiliza uma interface customizável e isolada do projeto onde está instalada. Esse webphone usa o [wavoip-api-websocket.md](wavoip-api-websocket.md "mention") por debaixo dos panos

## Instalação

Instale a biblioteca utilizando seu gerenciador de dependências favorito

{% tabs %}
{% tab title="PNPM" %}
```bash
pnpm add @wavoip/wavoip-webphone
```
{% endtab %}

{% tab title="NPM" %}
```bash
npm install @wavoip/wavoip-webphone
```
{% endtab %}

{% tab title="CDN" %}
```html
<script src="https://cdn.jsdelivr.net/npm/@wavoip/wavoip-webphone@latest/dist/index.umd.min.js"></script>
```
{% endtab %}
{% endtabs %}

## Primeiros Passos

### Biblioteca instalada

Importe o objeto do webphone e chame a função **render()**

{% code lineNumbers="true" %}
```typescript
import WavoipWebphone from "@wavoip/wavoip-webphone"

WavoipWebphone.render()
```
{% endcode %}

Simples assim, a interface será renderizada na tela.

Para remover a interface, basta chamar a função **destroy()**

{% code lineNumbers="true" %}
```typescript
WavoipWebphone.destroy()
```
{% endcode %}

### CDN

Use a variável **wavoipWebphone** que se encontra dentro da variável _window_

{% code lineNumbers="true" %}
```typescript
window.wavoipWebphone.render()
window.wavoipWebphone.destroy()
```
{% endcode %}

## Controlando o Webphone em Código (API)

Ao renderizar o webphone, ele retornára uma [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) de uma API para controlá-lo, além de criar uma propriedade **wavoip** na variável [window](https://developer.mozilla.org/en-US/docs/Web/API/Window) com a mesma API

```typescript
WavoipWebphone.render(): Promise<WavoipAPI>
```

A partir disso, você pode utilizar a API da forma que escolher:

{% tabs %}
{% tab title="Instalado" %}
```typescript
import WavoipWebphone from "@wavoip/wavoip-webphone"

const webphoneAPI = await WavoipWebphone.render()
webphoneAPI.call.start("00999998888")

// OU 

await WavoipWebphone.render()
window.wavoip.call.start("00999998888")
```
{% endtab %}

{% tab title="CDN" %}
```typescript
const webphoneAPI = await window.wavoipWebphone.render()
webphoneAPI.call.start("00999998888")

// OU

await window.wavoipWebphone.render()
window.wavoip.call.start("00999998888")
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
É importante usar um **await** ao chamar o **render()**. Não fazer isso pode levar a comportamentos inesperados
{% endhint %}

### WebphoneAPI

```typescript
type WebphoneAPI = {
    call: CallAPI;
    device: DeviceAPI;
    notifications: NotificationsAPI;
    widget: WidgetAPI;
    theme: ThemeAPI;
    position: PositionAPI;
    settings: SettingsAPI;
};
```

### Controlando as Chamadas  (CallAPI)

{% code lineNumbers="true" expandable="true" %}
```typescript
type CallAPI = {
  start( to: string, config: { fromTokens?: string[], displayName?: string }) => Promise<
    | { err: { message: string; devices: { token: string; reason: string }[] } }
    | { err: null }
  >;
  startCall( to: string, fromTokens: string[] | null ) => Promise<
    | { err: { message: string; devices: { token: string; reason: string }[] } }
    | { err: null }
  >; // Deprecated
  getCallActive(): CallActiveProps | undefined;
  getCallOutgoing(): CallProps | undefined;
  getOffers(): CallProps[];
  setInput(to: string): void;
  onOffer(cb: (offer: CallProps) => void): void;
}

type CallProps = {
  id: string;
  type: CallType;
  device_token: string;
  direction: CallDirection;
  status: CallStatus;
  peer: {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
    muted: boolean;
  };
  muted: boolean;
}
```
{% endcode %}

Para informações sobre como iniciar uma call leia: [#realizando-uma-ligacao-outgoing](wavoip-api-websocket.md#realizando-uma-ligacao-outgoing "mention")

* **setInput()**: Seta o input de número para ligar na interface do webphone

### Controlando os Dispositivos (DeviceAPI)

{% code lineNumbers="true" fullWidth="false" expandable="true" %}
```typescript
type DeviceAPI = {
    get(): Devices[]
    getDevices(): Devices[]; // Depreciado
    add(token: string, persist?: boolean): void;
    addDevice(token: string, persist?: boolean): void; // Depreciado
    remove(token: string): void;
    removeDevice(token: string): void; // Depreciado
    enable(token: string): void;
    enableDevice(token: string): void; // Depreciado
    disable(token: string): void;
    disableDevice(token: string): void; // Depreciado
}
```
{% endcode %}

Para informações sobre os dispositivos, leia [#dispositivos](wavoip-api-websocket.md#dispositivos "mention")

Ao adicionar um dispositivo com **addDevice** passando o parâmetro persist como _True_ o dispositivo e suas configurações serão salvas no [Local Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) do navegador, persistindo entre sessões

{% hint style="info" %}
Desabilitar um dispositivo mata a conexão entre o webphone e o dispositivo, mas o dispositivo continua rodando
{% endhint %}

### Controlando as Notificações (NotificationsAPI)

{% code lineNumbers="true" expandable="true" %}
```typescript
type NotificationsAPI = {
    get(): NotificationsType[];
    getNotifications(): NotificationsType[]; // Depreciado
    add(notification: NotificationsType): void;
    addNotification(notification: NotificationsType): void;  // Depreciado
    remove(id: Date): void;
    removeNotification(id: Date): void;  // Depreciado
    clear(): void;
    clearNotifications(): void;  // Depreciado
    read()
    readNotifications(): void;  // Depreciado
}

type NotificationsType = {
    id: Date;
    type: "INFO" | "CALL_FAILED";
    message: string;
    detail: string;
    token: string;
    isRead: boolean;
    isHidden: boolean;
    created_at: Date;
}
```
{% endcode %}

### Controlando o Widget (WidgetAPI)

{% code lineNumbers="true" expandable="true" %}
```typescript
type WidgetAPI = {
    isOpen: boolean;
    open(): void;
    close(): void;
    toggle(): void;
    buttonPosition: {
        value: { x: number, y: number }
        set(position: "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | { x: number; y: number; }): void;
    }
}
```
{% endcode %}

### Controlando o Tema (ThemeAPI)

{% code lineNumbers="true" expandable="true" %}
```typescript
type ThemeAPI = {
    value: "light" | "dark" | "system"
    set(theme: "light" | "dark" | "system"): void;
    setTheme(theme: "light" | "dark" | "system"): void; // Depreciado
}
```
{% endcode %}

### Controlando a Posição (PositionAPI)

{% code lineNumbers="true" expandable="true" %}
```typescript
type PositionAPI = {
   value: { x: number; y: number };
   set(position: "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | { x: number; y: number; }): void;
}
```
{% endcode %}

## Configurando o Webphone

### Inicialização

Ao renderizar o webphone com o **render()** você pode passar alguns parâmetros

{% code lineNumbers="true" fullWidth="false" expandable="true" %}
```typescript
WavoipWebphone.render(config?: WebphoneSettings)
```
{% endcode %}

Os parâmetros são os seguintes

{% code lineNumbers="true" fullWidth="false" expandable="true" %}
```typescript
type WebphoneSettings = {
  theme?: "system" | "dark" | "light"; // (default: "system")
  statusBar?: {
    showNotificationsIcon?: boolean; // Mostrar o sino que abre as notificações (default: true)
    showSettingsIcon?: boolean; // Mostrar a engrenagem que abre o menu de configurações (default: true)
  };
  settingsMenu?: {
    deviceMenu?: {
      show?: boolean; // Mostrar o menu de dispositivos dentro do menu de configurações (default: true)
      showAddDevices?: boolean; // Mostrar o botão de habilitar/desativar dispositivos na tela de configurações (default: true)
      showEnableDevicesButton?: boolean; // Mostrar o switch de habilitar/desativar dispositivos na tela de configurações (default: true)
      showRemoveDevicesButton?: boolean; // Mostrar o botão de remover dispositivos na tela de configurações (default: true)
    };
  };
  widget?: {
    showWidgetButton?: boolean;  // Mostrar o botão de telefone que abre o discador (botão verde no canto da tela ao renderizar o webphone (default: true)
    startOpen?: boolean; // Renderizar o webphone com o discador aberto (default: false)
  };
  position?: "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | { x: number; y: number; }; // (default: "bottom-right")
}
```
{% endcode %}

### Enquanto roda (SettingsAPI)

Ao renderizar, a variável window terá uma propriedade **wavoip** que pode ser usada para mudar as configurações em tempo real

{% code lineNumbers="true" expandable="true" %}
```typescript
type SettingsAPI = {
    // Mostrar o sino que abre as notificações
    showNotifications: boolean; 
    setShowNotifications(show: boolean): void;
    // Mostrar a engrenagem que abre o menu de configurações
    showSettings: boolean; 
    setShowSettings(show: boolean): void;
    // Mostrar o menu de dispositivos dentro do menu de configurações
    showDevices: boolean; 
    setShowDevices(show: boolean): void;
    // Mostrar o botão de adicionar dispositivos no menu de configurações
    showAddDevices: boolean; 
    setShowAddDevices(show: boolean): void;
    // Mostrar o botão de habilitar/desativar dispositivos na tela de configurações
    showEnableDevices: boolean; 
    setShowEnableDevices(show: boolean): void;
    // Mostrar o botão de remover dispositivos na tela de configurações
    showRemoveDevices: boolean; 
    setShowRemoveDevices(show: boolean): void;
    // Mostrar o botão de telefone que abre o discador (botão verde no canto da tela ao renderizar o webphone)
    showWidgetButton: boolean; 
    setShowWidgetButton(show: boolean): void; 
}
```
{% endcode %}

