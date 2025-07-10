# Guia do Usuário - Sistema de Monitoramento Vigia

Bem-vindo ao guia do usuário do Sistema de Monitoramento Vigia. Este documento explica as principais funcionalidades do sistema e como utilizá-lo para monitorar ambientes e receber alertas de movimento.

---

## Primeiros Passos Rápidos para Desenvolvedores

1.  **Clone o repositório:**
    ```bash
    git clone <url-do-repositorio>
    cd vigia
    ```
2.  **Execute o script de configuração:**
    ```bash
    ./setup_dev.sh
    ```
    - O script irá criar arquivos `.env` de exemplo para o backend e frontend, instalar dependências e preparar o banco de dados.
    - Edite o arquivo `vigia-backend/.env` com seus dados reais de e-mail e chave JWT.
    - O arquivo `vigia-frontend/.env` será criado com a URL padrão do backend (`http://localhost:5000`). Edite-o se o seu backend estiver rodando em um endereço diferente.
3.  **Suba o sistema com Docker Compose:**
    ```bash
    docker-compose up --build
    ```
    - O frontend estará disponível em `http://localhost:8597`.
    - O backend estará disponível em `http://localhost:5000`.

---

## Usuário e Senha Inicial

- **Usuário:** admin
- **Senha:** A senha inicial `testpassword` é definida no backend. **É altamente recomendável alterá-la após o primeiro acesso** para garantir a segurança do sistema.

---

## O que é o Vigia?

O Vigia é um sistema de monitoramento de segurança que utiliza a câmera de um computador (onde o backend está rodando) para detectar movimentos em tempo real. Ele é composto por duas partes:

1.  **Backend (Servidor):** Responsável por acessar a câmera, executar o algoritmo de detecção de movimento e fornecer o feed de vídeo e os dados de alerta.
2.  **Frontend (Interface Web):** Uma aplicação web que permite controlar o backend remotamente, visualizar o feed de vídeo ao vivo, configurar alertas por e-mail e ver um histórico das detecções.

## Principais Funcionalidades

*   **Detecção de Movimento:** O sistema analisa o feed de vídeo para identificar movimentos significativos no ambiente monitorado.
*   **Monitoramento em Tempo Real:** Visualize o feed de vídeo da câmera ao vivo através da interface web.
*   **Alertas Visuais:** Receba notificações na interface web sempre que um movimento for detectado.
*   **Sistema de Capturas:** Veja imagens capturadas automaticamente no momento da detecção de movimento.
*   **Alertas por E-mail:** Configure o sistema para enviar notificações por e-mail com imagens anexadas quando um alerta for acionado.
*   **Sensibilidade Ajustável:** Controle a sensibilidade do algoritmo de detecção de movimento para adaptá-lo ao seu ambiente.
*   **Controle Remoto:** Inicie, pause ou pare o monitoramento diretamente pela interface web de qualquer dispositivo.
*   **Interface Responsiva:** Acesse e utilize o sistema em computadores, tablets ou celulares.

## Requisitos do Sistema

Para utilizar o Vigia, você precisará:

*   Um computador com uma webcam conectada e acessível pelo sistema operacional.
*   Python 3 e as dependências do backend instaladas.
*   Node.js e as dependências do frontend instaladas.
*   Um servidor de e-mail SMTP configurado (necessário apenas para alertas por e-mail).

## Como Instalar e Executar

O sistema Vigia é dividido em duas partes (backend e frontend) que devem ser executadas separadamente.

### 1. Configurar e Executar o Backend

1.  Abra um terminal e navegue até a pasta `vigia-backend`:
    ```bash
    cd vigia-backend
    ```
2.  (Opcional, mas recomendado) Crie e ative um ambiente virtual:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```
3.  Instale as dependências do Python:
    ```bash
    pip install -r requirements.txt
    ```
4.  Inicie o servidor backend:
    ```bash
    python app.py
    ```
    O backend estará rodando e pronto para receber conexões do frontend.

### 2. Configurar e Executar o Frontend

1.  Abra um **novo** terminal e navegue até a pasta `vigia-frontend`:
    ```bash
    cd vigia-frontend
    ```
2.  Instale as dependências do Node.js (utilizando npm ou yarn, dependendo do seu ambiente):
    ```bash
    npm install
    # ou yarn install
    ```
3.  Inicie o servidor de desenvolvimento do frontend:
    ```bash
    npm run dev
    # ou yarn dev
    ```
    O frontend estará acessível em seu navegador em `http://localhost:8597` (ou na porta indicada pelo Vite).

## Utilizando o Sistema

1.  **Acesse a Interface:** Abra seu navegador e vá para o endereço onde o frontend está rodando (geralmente `http://localhost:8597`).
2.  **Login:** Na tela de login, insira suas credenciais para acessar o sistema. (As credenciais padrão podem precisar ser configuradas no backend inicialmente).
3.  **Tela Principal:** Após o login, você verá a tela principal com o feed de vídeo (se o backend estiver rodando e acessando a câmera), controles de monitoramento e a seção de configurações.
4.  **Controles de Monitoramento:**
    *   **Iniciar Monitoramento:** Clique no botão correspondente para ativar a detecção de movimento no backend.
    *   **Pausar Monitoramento:** Clique para pausar temporariamente a detecção. O feed de vídeo pode continuar ativo, mas alertas não serão gerados.
    *   **Parar Monitoramento:** Clique para desativar completamente o processo de monitoramento e o feed de vídeo.
5.  **Ajustar Sensibilidade:** Use o slider na seção de status para ajustar a tolerância da detecção de movimento. Valores mais baixos tornam o sistema mais sensível.
6.  **Configurar E-mail:** Expanda a seção "Configurações de E-mail" para inserir os dados do seu servidor SMTP e o endereço de e-mail para onde os alertas devem ser enviados. Clique em "Salvar Configurações" e "Testar SMTP" para verificar se a configuração está correta.
7.  **Visualizar Alertas:** Quando o monitoramento estiver ativo e movimento for detectado, você verá notificações na tela e as imagens capturadas aparecerão na seção "Capturas Recentes".
8.  **Atualizar Credenciais:** Clique no botão "Atualizar credenciais" (geralmente no canto inferior direito) para alterar sua senha ou o e-mail de recuperação.
9.  **Recuperação de Senha:** Na tela de login, se você esquecer sua senha, utilize a opção "Esqueci a senha" e siga as instruções para receber um código por e-mail e redefinir sua senha.

## Segurança e Privacidade

*   O backend utiliza autenticação JWT e hashing de senhas para proteger o acesso.
*   A lógica principal de detecção de movimento reside no backend.
*   As configurações de e-mail e credenciais são gerenciadas de forma segura.

---

Este guia cobre as funcionalidades básicas do sistema Vigia. Para detalhes técnicos sobre o código, consulte os READMEs específicos das pastas `vigia-backend` e `vigia-frontend`.

---
*Esse projeto foi gerado com muitos Tokens 🤖*