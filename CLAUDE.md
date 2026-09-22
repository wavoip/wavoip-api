# O projeto

Biblioteca TypeScript que leva chamadas de áudio dos devices Wavoip para projetos web.
Fala com os devices por Socket.IO e com as APIs padrão do navegador (WebRTC, AudioContext).

**É o único repositório com leitor externo**: quem instala `@wavoip/wavoip-api` lê a
documentação sem ler o código. Isso muda as regras de idioma e de comentário abaixo.

| Componente | Tecnologia |
|---|---|
| Linguagem | TypeScript |
| Build / teste | Vite, Vitest |
| WebSocket | Socket.IO |
| HTTP | Axios |
| Transporte de mídia | WebRTC (chamada oficial), WebSocket binário (chamada não oficial) |
| Áudio no WebSocket | PCM Int16 a 16kHz, **não** µ-law/PCMU (ver `AudioWorkletOut`) |
| Resample | LibSampleRateJs, dentro dos AudioWorklets |

## Estilo de código

- Funções: de 4 a 20 linhas. Passou, divida.
- Arquivos: abaixo de 500 linhas. Divida por responsabilidade.
- Uma coisa por função, uma responsabilidade por módulo (SRP).
- Nomes: específicos e únicos. Evite `data`, `handler`, `Manager`.
  Prefira nomes com menos de 5 ocorrências no grep do código.
- Tipos: explícitos. Nada de `any`, `Dict` ou função sem tipo.
- Sem duplicação. Extraia a lógica compartilhada para uma função ou módulo.
- Retorno cedo em vez de `if` aninhado. No máximo 2 níveis de indentação.
- Mensagem de exceção inclui o valor ofensor e a forma esperada.

## Idioma

**Identificador é em inglês; texto que uma pessoa da equipe lê é em português.** Classe,
função, variável, arquivo, nome de evento e título de `it(…)` em inglês; comentário
interno, `.md` e mensagem de commit em português.

**A superfície pública é outra conversa.** O que chega ao integrador — o JSDoc que sai
no `dist/index.d.ts` e aparece no autocomplete dele, e o `README.md` — está em inglês,
e a língua dela é decisão de produto, não convenção interna (DEV-453). Até ela ser
tomada, não traduza esse texto. O `docs/` do GitBook, também público, já é pt-BR.

Para saber de que lado um comentário está: ele aparece no `dist/index.d.ts` depois do
`pnpm build`? Então é público.

## Comentários e documentação

- **Comentário interno registra o que o código não diz**: o porquê, a restrição
  externa, o caminho não tomado. O que a função faz o código já diz. Sem `@example`
  interno — o exemplo que não desatualiza é o teste.
- **JSDoc público é documentação de produto**, lido por quem não tem o código. Ele pode
  e deve dizer o que a função faz; o que não pode é ficar errado.
- **A decisão mora aqui; a investigação mora na issue.** Cite a issue ou o PR e siga.
- **Cada regra tem um dono só.** A regra de reconexão mora no `WSConnection`, o formato
  do áudio no `AudioWorkletOut`, o bug do Chromium no `RTCAudioPipe`. Os outros lugares
  no máximo apontam para ele.
- **Releia o comentário e o `.md` que a sua mudança tocou.** Não "preserve" nem
  "atualize se mudou o comportamento": releia. Documentação errada é pior que ausente,
  porque a ausente ninguém segue.

## Testes

- Os testes rodam com um comando só: `pnpm test`.
- Toda função nova ganha teste. Correção de bug ganha teste de regressão.
- I/O externo (API, banco, sistema de arquivos) é trocado por classes fake nomeadas,
  e não por stubs inline.
- Testes F.I.R.S.T: rápidos, independentes, repetíveis, autoverificáveis, oportunos.

## Formatação

- Use o formatador padrão da linguagem (`biome`). Não discuta estilo além disso.

# Documentação pública (`docs/`)

Formatada para o GitBook, sincronizado pelo Git; o `.gitbook.yaml` na raiz aponta para
`./docs/`. Tudo em **pt-BR** — descrição, cabeçalho de tabela, texto, aviso, título de
passo e comentário dentro de exemplo. Identificador, nome de tipo e sintaxe de bloco do
GitBook ficam em inglês.

## Estrutura
```
docs/
  README.md          ← página inicial
  SUMMARY.md         ← sumário e barra lateral
  getting-started/
    installation.md
    initialization.md
  device.md
  calls/
    incoming.md
    outgoing.md
    active.md
  media.md
  types.md
  troubleshooting.md
```

## Sintaxe do GitBook
- **Frontmatter**: bloco YAML no topo — campos `description:`, `icon:`, `hidden:`, `layout:`.
- **Avisos**: `{% hint style="info|warning|danger|success" %}...{% endhint %}`
- **Abas**: `{% tabs %}{% tab title="..." %}...{% endtab %}{% endtabs %}`
- **Stepper**: `{% stepper %}{% step %}## Title\ncontent{% endstep %}{% endstepper %}`
- **Expansível**: `<details><summary>Título</summary>conteúdo</details>`
- **Colunas** (no máximo 2): `{% columns %}{% column %}...{% endcolumn %}{% endcolumns %}`
- **Botões**: `<a href="..." class="button primary">Label</a>`
- **Cartões**: `<table data-view="cards">` with `<th data-card-target data-type="content-ref">`
- Link interno usa caminho `.md` relativo: `[texto](../device.md)`
- Feche todo bloco customizado exatamente: tag desencontrada quebra a renderização em silêncio.

## Quando atualizar

Toda mudança que altera como quem consome `@wavoip/wavoip-api` usa a biblioteca
atualiza o `docs/` na mesma mudança. Isso inclui:
- tipo, classe ou método público novo, renomeado ou removido;
- evento novo, renomeado, removido ou com payload diferente em `Wavoip`, `Device`,
  `Offer`, `CallOutgoing`, `CallActive`;
- mudança de ordem, semântica ou replay/buffer do fluxo de chamada que o consumidor vê;
- mudança nas opções do construtor do `Wavoip` ou no `setLanguage`/locale;
- mudança de nome de evento de WebSocket que o consumidor observa.

Mantenha o `SUMMARY.md` igual à estrutura real — o GitBook o usa como a barra lateral.

# CI/CD

Depois de toda mudança, os três têm que passar:
```
pnpm lint
pnpm test
pnpm build
```
