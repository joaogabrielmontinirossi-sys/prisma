# Prisma

Transforma qualquer planilha do Excel ou do Google Planilhas em resumo, gráficos, relatório, infográfico e cartões prontos para compartilhar, incluindo uma versão bem fofinha para quem não é de números. Funciona no navegador, no celular e no Windows, com sincronização entre computadores pelo Google Drive.

Os dados são lidos e analisados no próprio aparelho: nada é enviado para servidores.

## Usar no navegador (site)

Abra **https://joaogabrielmontinirossi-sys.github.io/prisma/** e clique em **Nova planilha**.

## No celular

Abra o mesmo endereço no navegador do celular.

- **Android (Chrome)**: toque em **Instalar o aplicativo** no menu lateral (ou em ⋮ › *Instalar app*). O Prisma ganha ícone na tela inicial e abre em tela cheia.
- **iPhone/iPad (Safari)**: toque em **Compartilhar** › **Adicionar à Tela de Início**.

Depois de aberto uma vez, funciona sem internet. As planilhas ficam guardadas no próprio aparelho; para levá-las ao computador (ou trazê-las de lá), use **Ajustes › Exportar backup** e **Importar…**.

## No Windows (.exe)

Pegue o `Prisma.exe` na página de [Releases](../../releases/latest) e abra. Não precisa instalar nada: o programa usa o Edge (ou o Chrome) que já está no Windows para mostrar a janela.

Como o arquivo não é assinado, o Windows pode mostrar o aviso do SmartScreen na primeira vez: clique em **Mais informações** e depois em **Executar assim mesmo**.

## De onde vêm os dados

- **Arquivo**: Excel (`.xlsx`, `.xlsm`), CSV ou TSV. Arraste para a janela ou use **Escolher arquivo**. O formato `.xls` antigo precisa ser salvo como `.xlsx` antes.
- **Link do Google Planilhas**: cole o endereço da planilha. Ela precisa estar compartilhada como *Qualquer pessoa com o link*. O botão **Atualizar** busca a versão mais recente quando a planilha mudar.
- **Colar**: copie as células no Excel ou no Google Planilhas e cole na caixa. Serve para planilhas particulares.

## Como ele entende a planilha

Planilhas de verdade raramente são uma tabela só. O Prisma recorta cada aba em blocos e separa o que encontra:

- **Tabelas**: várias por aba, lado a lado ou empilhadas, com células mescladas, linhas em branco no meio e espaços reservados entre grupos. Cada uma vira uma tabela analisável, escolhida no seletor **Tabela** ou na Visão geral.
- **Indicadores**: números soltos com rótulo em cima ou ao lado (os "cartões" de um painel). Aparecem na Visão geral; quando o mesmo indicador se repete em várias abas (o saldo de cada mês, por exemplo), vira um gráfico comparando as abas.
- **Títulos e observações**: dão nome à planilha e às tabelas e ficam fora das contas.

Também reconhece tabelas com os períodos nas colunas (jan, fev… ou 2023, 2024…), valores negativos (saídas) misturados com positivos (entradas), traços e erros de fórmula usados como "sem valor", linhas de "Total" e o tipo de cada coluna (número, R$, %, data, categoria, texto, código). Se errar, o tipo pode ser trocado na aba **Dados**. A barra de foco no topo escolhe a tabela, qual valor analisar, por qual coluna agrupar e se a conta é soma ou média.

## O que ele gera

| Aba | Para quê |
| --- | --- |
| **Visão geral** | Tudo o que foi encontrado na planilha inteira: indicadores, comparação entre abas e a lista de tabelas (aparece quando há mais de uma tabela ou indicadores) |
| **Resumo** | Número principal, indicadores, "em uma frase", "em 3 pontos", resumo completo e um texto pronto para mandar por mensagem |
| **Gráficos** | Galeria automática (linha no tempo, barras, rosca, distribuição, dispersão) e um montador para criar os seus; cada gráfico vira imagem PNG ou tabela |
| **Relatório** | Documento formal com sumário executivo, análise, perfil das colunas e qualidade dos dados |
| **Infográfico** | Pôster com os números grandes, ranking, participação e linha do tempo |
| **Fofinho** | A mascote Pri explica a planilha sem jargão, com pódio, "de cada 10" e um dicionário de termos |
| **Cartões** | Um achado por imagem (1080×1350), para salvar ou compartilhar |
| **Dados** | A tabela com busca, ordenação e exportação em CSV |

O botão **PDF** junta tudo num arquivo só: todas as abas da tabela aberta, a planilha inteira (visão geral e o relatório de cada tabela) ou apenas a aba que está na tela.

## Sincronização

Funciona como no [Ishikawa](https://github.com/joaogabrielmontinirossi-sys/ishikawa) e no [Capynote](https://github.com/joaogabrielmontinirossi-sys/capynote): o Prisma para Windows grava o arquivo `prisma-sync.json` numa pasta do Google Drive para computador (`Meu Drive\Prisma`) a cada alteração, e o Drive o leva aos outros aparelhos. Outro computador com o Prisma e o mesmo Drive recebe as planilhas automaticamente.

- Se o Google Drive para computador estiver instalado, a sincronização já começa ligada.
- Em **Ajustes** dá para desativar, trocar de conta (cada unidade G:, H:… é uma conta) ou escolher qualquer outra pasta sincronizada (OneDrive, Dropbox…).
- Alterações feitas em dois aparelhos são mescladas por planilha: vale a versão mais recente de cada uma, e exclusões também são propagadas.

Sem sincronização, os dados ficam só neste computador (em `%LOCALAPPDATA%\Prisma`). Use **Ajustes › Exportar backup** para levar tudo a outro lugar.

A cada alteração na pasta `app/` da branch `main`, o GitHub Actions publica a versão web automaticamente (`.github/workflows/web.yml`).

## Compilar

Só precisa do Windows (usa o compilador C# do .NET Framework e o Edge, que já vêm instalados):

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Gera `dist\Prisma.exe` e `dist\prisma.html` (versão em arquivo único, que abre em qualquer navegador; nela a sincronização automática não está disponível, apenas o backup).

| Pasta | Conteúdo |
| --- | --- |
| `app/` | O aplicativo (HTML, CSS e JavaScript puros, sem dependências) |
| `app/reader.js` | Leitura de `.xlsx`, CSV e links do Google Planilhas |
| `app/analyze.js` | Tipos de coluna, agregações e os achados em português |
| `app/charts.js` | Gráficos em SVG |
| `app/views.js` | As sete abas |
| `desktop/Prisma.cs` | Programa de Windows: serve o app em `localhost`, grava a pasta de sincronização, baixa planilhas do Google e gera o PDF |
| `build.ps1` | Gera os ícones, compila o `.exe` e monta o arquivo único |
