# Project Tree Generator

Gerador visual e via terminal de estruturas de projetos a partir de árvores ASCII.

A ideia é simples e poderosa: você escreve ou cola uma estrutura no estilo `tree`, escolhe uma pasta de destino e o app cria automaticamente diretórios e arquivos. Para acelerar ainda mais, ele já vem com templates prontos para Flask, FastAPI, Django, React + Vite, Node.js + Express e Python CLI.

> Status: funcional, mas ainda em evolução. É uma ferramenta útil para ganhar tempo criando esqueletos de projetos, especialmente quando você vive começando apps, APIs, dashboards e experimentos. A fábrica de pastas está viva — só não prometa café ainda.

---

## Preview

![Preview do Project Tree Generator](preview.png)

---

## O que ele faz

O **Project Tree Generator** transforma uma árvore ASCII como esta:

```txt
meu_projeto/
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── templates/
│   └── index.html
├── app.py
├── requirements.txt
└── README.md
```

em uma estrutura real de pastas e arquivos no seu computador.

Além disso, alguns arquivos podem ser criados já com conteúdo inicial. Por exemplo, ao usar o template Flask, o `app.py`, `index.html`, `style.css`, `app.js`, `requirements.txt`, `run.bat` e `README.md` já nascem preenchidos com um esqueleto básico.

---

## Principais recursos

- Interface gráfica desktop feita com **PySide6 / Qt for Python**.
- Tema escuro moderno.
- Editor de árvore ASCII editável.
- Pré-visualização em tempo real da estrutura que será criada.
- Templates prontos para:
  - Flask
  - FastAPI
  - Django
  - React + Vite
  - Node.js + Express
  - Python CLI
- Suporte a carregar templates externos em `.txt`.
- Modo **Dry-run**, para visualizar sem criar nada no disco.
- Opção para abrir a pasta gerada ao finalizar.
- CLI compatível para uso direto pelo terminal.
- Scripts de build para gerar executável Windows com PyInstaller.
- Suporte a instalador Windows via Inno Setup.
- Workflow de GitHub Actions para build automático.

---

## Estrutura do projeto

```txt
flask_project_generator/
├── .github/
│   └── workflows/
│       └── build-windows.yml
├── assets/
│   ├── icon.ico
│   └── icon.png
├── installer/
│   └── installer.iss
├── generator.py
├── gui.py
├── main.py
├── templates_data.py
├── requirements.txt
├── build_windows.bat
├── ProjectTreeGenerator.spec
├── README.md
├── README_BUILD.md
└── preview.png
```

### Arquivos principais

| Arquivo | Função |
|---|---|
| `main.py` | Ponto de entrada da aplicação gráfica. |
| `gui.py` | Interface desktop com PySide6. |
| `generator.py` | Núcleo de parsing, criação de arquivos/pastas e CLI. |
| `templates_data.py` | Biblioteca de templates prontos e conteúdos iniciais. |
| `requirements.txt` | Dependências Python. |
| `build_windows.bat` | Script para gerar executável no Windows. |
| `ProjectTreeGenerator.spec` | Configuração do PyInstaller. |
| `installer/installer.iss` | Script do instalador Inno Setup. |
| `.github/workflows/build-windows.yml` | Build automático via GitHub Actions. |

---

## Requisitos

- Python **3.10+**
- Windows, Linux ou macOS para rodar via Python
- Windows 10/11 para gerar o executável/instalador Windows

Dependência principal:

```txt
PySide6>=6.6
```

---

## Instalação

Clone o repositório ou extraia o ZIP:

```bash
cd flask_project_generator
```

Crie e ative um ambiente virtual:

### Windows

```bat
python -m venv .venv
.venv\Scripts\activate
```

### Linux/macOS

```bash
python -m venv .venv
source .venv/bin/activate
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

---

## Como usar pela interface gráfica

Rode:

```bash
python main.py
```

Depois:

1. Escolha um template na lista lateral.
2. Edite a árvore ASCII, se quiser personalizar.
3. Confira a pré-visualização.
4. Escolha a pasta de destino.
5. Marque ou desmarque as opções:
   - **Abrir pasta ao final**
   - **Usar conteúdo inicial do template**
   - **Dry-run**
6. Clique em **Gerar estrutura**.

Simples. Brutalmente útil. O tipo de ferramenta que evita aquele ritual místico de criar `static`, `templates`, `src`, `tests` e meia dúzia de arquivos na unha.

---

## Como usar pelo terminal

O arquivo `generator.py` também funciona via CLI.

```bash
python generator.py -input template.txt -output ./meu_projeto
```

Para abrir a pasta ao final:

```bash
python generator.py -input template.txt -output ./meu_projeto --open
```

---

## Formato aceito do template

O app aceita árvores ASCII no formato clássico:

```txt
novo_projeto/
├── app/
│   ├── __init__.py
│   └── main.py
├── tests/
│   └── test_main.py
├── requirements.txt
└── README.md
```

### Regras de interpretação

- Linhas terminadas em `/` são tratadas como **pastas**.
- Nomes com ponto, como `app.py`, `index.html` e `README.md`, são tratados como **arquivos**.
- Comentários após `#` são ignorados.
- Caracteres de árvore aceitos incluem `├`, `└`, `│` e `─`.

Exemplo com comentário:

```txt
meu_app/
├── app.py          # arquivo principal
├── templates/      # pasta de templates
│   └── index.html
└── requirements.txt
```

---

## Templates disponíveis

### Flask

Cria um app Flask básico com:

```txt
static/css/style.css
static/js/app.js
templates/index.html
app.py
requirements.txt
run.bat
open_cmd.bat
README.md
```

### FastAPI

Cria uma estrutura inicial com `app/main.py`, pasta de routers, testes e requirements.

### Django

Cria uma base com `config/`, `app/`, `manage.py`, `requirements.txt` e `README.md`.

### React + Vite

Cria um projeto React simples com `src/App.jsx`, `src/main.jsx`, `index.html` e `package.json`.

### Node.js + Express

Cria uma API Express mínima com `src/index.js` e `package.json`.

### Python CLI

Cria uma base para ferramenta de linha de comando em Python, com `src/`, `tests/` e `requirements.txt`.

---

## Dry-run

O modo **Dry-run** mostra o que seria criado sem mexer no disco.

Use isso quando quiser conferir a estrutura antes de disparar a criação real. É o botão do “calma, deixa eu ver se essa criatura não vai nascer com três braços”.

---

## Gerar executável Windows

O projeto já vem preparado para empacotar com PyInstaller.

No Windows, rode:

```bat
build_windows.bat
```

Esse script:

1. Cria um `.venv` local.
2. Instala as dependências.
3. Instala o PyInstaller.
4. Limpa builds antigos.
5. Gera o executável.
6. Tenta gerar o instalador com Inno Setup, se estiver instalado.

Saída esperada:

```txt
dist\ProjectTreeGenerator\ProjectTreeGenerator.exe
```

Se o Inno Setup estiver instalado, também será gerado algo como:

```txt
installer\Output\ProjectTreeGenerator-Setup-1.0.0.exe
```

Para detalhes completos, veja:

```txt
README_BUILD.md
```

---

## Build automático com GitHub Actions

O projeto inclui o workflow:

```txt
.github/workflows/build-windows.yml
```

Ele permite gerar o executável e o instalador automaticamente no GitHub Actions.

Funciona em:

- push para `main` ou `master`
- execução manual via `workflow_dispatch`
- criação de tags no formato `v*`, como `v1.0.0`

Ao gerar uma tag, o workflow também pode criar uma release com o instalador anexado.

---

## Ideias para próximas versões

- Permitir salvar templates personalizados dentro da própria interface.
- Adicionar botão para duplicar template existente.
- Adicionar validação visual de nomes inválidos para Windows/Linux.
- Permitir escolher se arquivos existentes serão sobrescritos ou preservados.
- Criar histórico de estruturas geradas.
- Adicionar exportação da árvore editada para `.txt`.
- Suportar variáveis como `{{project_name}}`, `{{author}}` e `{{port}}`.
- Criar mais templates: Electron, Flask + Bootstrap, FastAPI + Jinja2, Docker, Tailwind, Vue, Next.js.

---

## Observações importantes

- O nome da pasta original é `flask_project_generator`, mas o app não é limitado a Flask.
- O núcleo real do projeto é genérico: ele cria qualquer estrutura baseada em árvore ASCII.
- O preenchimento automático de conteúdo inicial depende dos nomes dos arquivos cadastrados em `templates_data.py`.
- Se dois arquivos tiverem o mesmo nome em lugares diferentes, o conteúdo inicial pode ser aplicado pelo nome do arquivo, não pelo caminho completo.

---

## Licença

Defina a licença antes de publicar oficialmente no GitHub.

Sugestão prática: se quiser permitir uso, modificação e distribuição com pouca burocracia, use **MIT License**.

---

## Autor

Projeto criado para acelerar a criação de estruturas de apps, APIs e ferramentas Python/JavaScript.

Porque criar pasta manualmente é aceitável uma vez. Na décima, já é castigo medieval.
