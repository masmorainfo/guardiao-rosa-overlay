# Overlay HTTPS — integração Streamer.bot

Esta pasta contém uma candidata a **Link Source** HTTPS, com a página hospedada no GitHub Pages e os eventos encaminhados pelo WebSocket local do Streamer.bot.

## O que acontece na página

- O navegador abre o WebSocket local do Streamer.bot em `ws://127.0.0.1:8080/`.
- A Action do Streamer.bot recebe os argumentos encaminhados pelo TikFinity e transmite JSON no formato `{"event":"gift|like","data":{...}}` com `CPH.WebsocketBroadcastJson`.
- A fila e os nomes ficam na memória do navegador. Esta página não envia eventos para o serviço que a hospeda e não carrega analytics ou bibliotecas externas.
- O Streamer.bot deve manter o servidor WebSocket em `127.0.0.1:8080` e iniciado. Não mude para `0.0.0.0`.
- A conexão HTTPS pública → loopback precisa ser confirmada no LIVE Studio depois da publicação.
- `?preview=1` mostra um cartão de demonstração sem abrir WebSocket.
- `?debug=1` mostra o estado da conexão; não use esse parâmetro na URL final da transmissão.
- Cada doador acumula o valor em diamantes dos presentes abaixo de 100; cada 15 diamantes geram um bloco. Presentes de 100 ou mais pausam a fila e não entram nesse acumulado.

## Action atual de retransmissão de eventos

O código pronto para colar está em `StreamerBot-Bridge.cs`. No Streamer.bot, abra a Action `GUARDIAO - Diagnostico TikFinity`, edite seu bloco **Execute Code**, substitua o código de diagnóstico por esse conteúdo e clique em **Save and Compile**. A Action também mantém o último JSON em `GF_Diag_Args`, sem persistir no disco. O código identifica taps pela presença de `likeCount`/`totalLikeCount`; os demais argumentos do TikFinity seguem como evento `gift`.

## Retorno real de fim das animações prioritárias

O overlay reconhece presentes prioritários pelos nomes configurados em `index.html`, bloqueia a fila comum com um token e toca a `.webm` no próprio player HTML5. O tempo nativo estimado por presente só agenda o início do vídeo; o desbloqueio normal ocorre pelo evento `ended` do vídeo.

1. Crie no Streamer.bot uma Action chamada exatamente `GUARDIAO - Priority End Relay`, sem gatilho.
2. Adicione a sub-action **Execute C# Code** e cole o conteúdo de `StreamerBot-Priority-End-Relay.cs`.
3. Salve e compile a Action.
4. No overlay, o WebSocket envia `DoAction` com `tokenId` e `reason`. A Action transmite `priorityEnd` em `General.Custom`; o controlador só encerra o bloqueio quando recebe o mesmo token.
5. Os `.webm` usados pelo player estão na pasta `media/`. As Actions do TikFinity que reproduziam esses mesmos vídeos precisam deixar de reproduzi-los, para evitar duplicação. O efeito nativo do TikTok continua como antes.

Perfis de animação configurados:

| Presente | Espera nativa | Arquivo |
| --- | ---: | --- |
| Capivara | 4 s | `media/capivara.webm` |
| Corgi | 4 s | `media/corgi01.webm` |
| Coroa | 4 s | `media/coroa01.webm` |
| Fênix real | 9 s | `media/fenix real.webm` |
| Fogos de artifício | 6 s | `media/fogos de artificios01.webm` |
| Galáxia | 10 s | `media/galaxaia01.webm` |
| Unicórnio galopando | 7 s | `media/unicornio galopando01.webm` |

Depois de validar o broadcast, crie/ative um Event de `Sending Likes (taps)` no TikFinity e associe-o a `GUARDIÃO PRINCIPAL`. O Event temporário foi removido após a descoberta do formato real dos argumentos.

## Arquivos publicados

O site precisa publicar `index.html`, `core.mjs` e a pasta `media/`. O relay C# está incluído como referência para configurar no Streamer.bot; não é carregado pelo site.

## Ainda não validado

- O WebSocket no WebView embutido do LIVE Studio.
- O pedido de permissão `loopback-network` nesse WebView.
- A transparência da página dentro do Link Source do LIVE Studio.
- O WebSocket local do Streamer.bot no WebView embutido do LIVE Studio.
- A chegada de um broadcast da Action ao overlay em um teste integrado.
- A detecção real do evento `ended` em cada `.webm` e a resposta `priorityEnd` pela Action do Streamer.bot ainda precisam ser ligadas e verificadas na sua instalação.
- Os tempos nativos do TikTok são estimativas medidas; precisam ser comparados com os efeitos na transmissão. O fim da `.webm` não usa essa estimativa.
- Os aliases dos sete presentes precisam corresponder ao texto de `giftName` recebido do TikFinity; se houver diferenças de nome, ajustaremos os aliases ou usaremos `giftId`.
- O ícone oficial do presente; os argumentos reais atuais do TikFinity não incluem uma URL do ícone.

O repositório e os arquivos de mídia são públicos. O overlay não envia dados de espectadores para o GitHub Pages; os eventos recebidos ficam na memória da página durante a sessão.
