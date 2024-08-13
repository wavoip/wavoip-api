# Wavoip - Biblioteca JavaScript para Chamadas de Áudio via WhatsApp

A Wavoip é uma biblioteca JavaScript inovadora que possibilita a integração fácil e rápida de chamadas de áudio via WhatsApp em seus projetos. Com esta biblioteca, você pode aproveitar as funcionalidades de chamada do WhatsApp para enriquecer a experiência do usuário em seus aplicativos web.

## Recursos Principais

- **Integração Simples:** Integre chamadas de áudio via WhatsApp em seus aplicativos web com apenas algumas linhas de código.
  
- **Personalização:** Adapte as chamadas de acordo com as necessidades do seu projeto, personalizando a experiência do usuário.

- **Compatibilidade:** Funciona perfeitamente em diversos navegadores, garantindo uma experiência consistente para os usuários.

- **Documentação Clara:** Oferecemos uma documentação abrangente para ajudar você a começar rapidamente e explorar todos os recursos da Wavoip.

## Como Começar

1. Instale a biblioteca em seu projeto:
   ```bash
   npm install wavoip-api

2. Siga a documentação para integrar a funcionalidade de chamada de áudio em seu aplicativo.

3. Aproveite os benefícios de oferecer chamadas de áudio via WhatsApp aos seus usuários!

1. Instale a biblioteca em seu projeto:
   ```javascript
    const Wavoip = require("wavoip-api");
    const WAV = new Wavoip;
    const whatsapp_instance = WAV.connect("my_token");

    whatsapp_instance.socket.on('connect', () => {
      console.log('Successfully connected!');

      whatsapp_instance.callStart({
        whatsappid: "phone_number"
      });
    });
   ```

Explore mais recursos e exemplos na nossa documentação.

## Contribuições
Contribuições são bem-vindas! Sinta-se à vontade para abrir issues, enviar pull requests ou fornecer feedback para tornar a Wavoip ainda melhor.

## Licença
Este projeto está licenciado sob a Licença MIT.

Lembre-se de substituir os marcadores de lugar, como `my_token` e `phone_number`, pelos valores apropriados. Boa sorte com o seu projeto!
