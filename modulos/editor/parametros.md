---
icon: brackets-square
---

# Parâmetros

Os parâmetros são funções da URL que permitem personalizar o comportamento da chamada. A seguir, veja a descrição de cada um deles e exemplos de uso.

*   **token** (obrigatório): Código de autenticação do dispositivo.

    * Exemplo: `?token=AF11C92C-2221-4551-B3340-64BE687833F645`


*   **phone** (obrigatório): Número de telefone para o qual a ligação será realizada, no formato internacional (código do país + DDD + número).

    * Exemplo: `?phone=551199951119`


*   **name** (opcional): Nome do destinatário da chamada.

    * Exemplo: `?name=Leonardo%20Amaro`


*   **start\_if\_ready** (opcional) (true, false): Define se a ligação deve ser iniciada automaticamente, sem a necessidade de confirmação.

    * Exemplo: `?start_if_ready=true`


*   **available\_after\_call** (opcional) (true, false): Indica se o sistema deve retornar para a tela de discagem após 5 segundos do término da chamada.

    * Exemplo: `?available_after_call=false`


*   **close\_after\_call** (opcional) (true, false): Indica se a janela deve ser fechada automaticamente após o fim da ligação.

    * Exemplo: `?close_after_call=true`



Esses parâmetros podem ser combinados conforme necessário, proporcionando flexibilidade e adaptação a diferentes cenários de uso.
