---
description: Integre sua instância Wavoip diretamente com seu Baileys
---

# Baileys

## Instalação

Instale a biblioteca utilizando seu gerenciador de dependências

```bash
pnpm add voice-calls-baileys
```

```bash
npm install voice-calls-baileys
```

```bash
yarn install voice-calls-baileys
```

## Começando a integração

Importe a classe da biblioteca e instancie ela com seu token de dispositivo

```typescript
import { useVoiceCallsBaileys } from "voice-calls-baileys";

const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    browser: Browsers.macOS('Desktop'),
    logger: P({ level: "error" }),
    syncFullHistory: false,
    markOnlineOnConnect: false
  })

useVoiceCallsBaileys("your token", sock, "open", true)
```

Substitua "your token" pelo token do dispositivo da Wavoip.



## Considerações importantes

Não conecte dois dispositivos Wavoip diferentes na mesma conexão Baileys, isso causará conflito entre as sessões.



## Tudo pronto, seu dispositivo está preparado!
