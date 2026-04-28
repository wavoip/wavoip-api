---
icon: play
---

# Primeiros Passos

## Vamos Começar!

Embora o uso da função `window.open()` do JavaScript seja uma maneira recomendada de abrir a URL do Click To Call em uma nova janela, não é um requisito obrigatório. O exemplo abaixo demonstra uma forma prática de utilizar o recurso:

{% code overflow="wrap" %}
```javascript
window.open("https://app.wavoip.com/call?token=SEU_TOKEN&phone=551194623151769&name=Leonardo%20Amaro&start_if_ready=true&available_after_call=false&close_after_call=true", "wavoiptest", { width: 300, height: 500 }
```
{% endcode %}

Esta função abre uma nova janela ou aba com a interface do Click To Call, permitindo realizar a ligação conforme os [parâmetros](parametros.md) fornecidos.

Viu como é simples? Você já está pronto para fazer ligações!
