---
icon: webhook
---

# Webhook (Beta)

O Webhook tem como finalidade integrar serviços externos aos dispositivos da Wavoip por meio de protocolo **HTTP.**&#x20;

## Como funciona

Assim que determinados eventos acontecerem na plataforma, eles serão emitidos para o endpoint em que você configurou na página do dispositivo

## Configurando o Webhook para um dispositivo

Para configurar o Webhook para um dispositivo, acesse [https://app.wavoip.com/devices](https://app.wavoip.com/devices), abra a págiona do dispositivo que deseja e, por fim, acesse pelo menu lateral **Integrações > Webhook.**

Dentro desse menu, coloque a URL do seu endpoint e salve. Assim que salvar, poderá habilitar/desabilitar seu Webhook, além de poder escolher quais [#eventos-do-webhook](webhook-beta.md#eventos-do-webhook "mention") quer receber

## Eventos do Webhook

### CALL

Ocorre sempre que uma call é iniciada ou atualizada

#### POST - Call foi iniciada

{% code fullWidth="false" %}
```typescript
{
    "type": "CALL",
    "action": "CREATE" | "UPDATE",
    "whatsapp_call_id": number,
    "id_session": number,
    "caller": string,
    "receiver": string,
    "status": 'NONE' | 'INCOMING_RING' | 'OUTGOING_RING' | 'OUTGOING_CALLING' | 'CONNECTING' | 'CONNECTION_LOST' | 'ACTIVE' | 'HANDLED_REMOTELY' | 'ENDED' | 'REJECTED' | 'REMOTE_CALL_IN_PROGRESS' | 'FAILED' | 'NOT_ANSWERED'
    "type": 'HUMANIZED' | 'ROBOTIC',
    "direction": 'INCOMING' | 'OUTCOMING',
    "duration": number,
    "record_status": READY' | 'RECORDING' | 'MIXING' | 'DISABLED' | 'EMPTY_RECORDING'
}

```
{% endcode %}

{% hint style="warning" %}
Para action do tipo "UPDATE" os campos relacionados a call são opcionais
{% endhint %}

### RECORD

Ocorre sempre que o status de uma gravação muda

```typescript
{
    "type": "RECORD",
    "action": "UPDATE",
    "whatsapp_call_id": number,
    "id_session": number,
    "record_status": 'READY' | 'RECORDING' | 'MIXING' | 'DISABLED' | 'EMPTY_RECORDING',
    "record_url": string
}
```

### DEVICE

Ocorre sempre que o status do dispositivo muda

```typescript
{
    "type": "DEVICE",
    "action": "UPDATE",
    "id_session": number,
    "phone": string,
    "status": "BUILDING" | "open" | "close"| "connecting" | "no_status" | "error" | "restarting" | "hibernating" | "WAITING_PAYMENT";
}
```

{% hint style="warning" %}
Em futuras versões os status "open" e "close" serão trocados por "connected" e "disconnected" respectivamente
{% endhint %}
