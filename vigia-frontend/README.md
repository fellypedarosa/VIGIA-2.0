# Vigia - Frontend Technical README

Este README descreve os aspectos técnicos e a arquitetura do frontend do sistema de monitoramento Vigia, focado em desenvolvedores.

## 🛠️ Tecnologias Utilizadas

- **React 18** com **TypeScript**: Para a construção da interface reativa e tipada.
- **Vite**: Ferramenta de build e servidor de desenvolvimento rápido.
- **Tailwind CSS**: Framework CSS utilitário para estilização rápida e responsiva.
- **Shadcn UI**: Coleção de componentes de UI construídos com Radix UI e estilizados com Tailwind CSS.

## 🏗️ Arquitetura e Funcionalidades Técnicas

O frontend é uma Single Page Application (SPA) que interage extensivamente com a API REST do `Vigia-Backend`. A comunicação é baseada em requisições HTTP assíncronas (`fetch`) e processamento de streams.

### Configuração do Backend

A URL do backend é configurada através da variável de ambiente `VITE_API_URL`. O script `setup_dev.sh` na raiz do projeto cria um arquivo `.env` em `vigia-frontend` com um valor padrão (`http://localhost:5000`). Se o seu backend estiver rodando em um endereço diferente, você deve editar este arquivo.

O código acessa a variável da seguinte forma:
```typescript
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
```

### Estrutura de Componentes

- `Index.tsx`: Componente raiz que gerencia o estado global de autenticação e renderiza condicionalmente as telas de Login, Recuperação de Senha, Gerenciamento de Credenciais ou o `SecurityMonitor`.
- `SecurityMonitor.tsx`: Componente principal que exibe o feed de vídeo, controles de monitoramento, alertas e integra o `EmailConfig`.
- `EmailConfig.tsx`: Componente para configurar as opções de alerta por e-mail.
- `PasswordForm.tsx`: Componente reutilizável para entrada e validação de senhas.

### Autenticação e Gerenciamento de Sessão

- O frontend utiliza **JSON Web Tokens (JWT)** para autenticação.
- O token JWT é obtido através do endpoint `POST /login` e armazenado no `localStorage`.
- Requisições subsequentes a endpoints protegidos incluem o token no cabeçalho `Authorization: Bearer <token>`. Uma função auxiliar (`authenticatedFetch` em `SecurityMonitor.tsx`) encapsula as chamadas `fetch` para adicionar o cabeçalho de autorização e tratar respostas `401 Unauthorized`, limpando o token e forçando o retorno à tela de login.
- O estado de autenticação (`isAuthenticated`) é gerenciado no `Index.tsx` com base na presença do token no `localStorage`.

### Comunicação com o Backend

O frontend interage com diversos endpoints do backend para funcionalidades específicas:

- `POST /login`: Autentica o usuário e retorna um token JWT.
- `GET /video_feed`: Recebe um stream de vídeo em tempo real no formato `multipart/x-mixed-replace`. O frontend processa este stream para exibir os frames na interface.
- `GET /check_alerts`: Realiza polling periódico para buscar novos alertas de movimento detectados pelo backend.
- `POST /start_monitoring`, `POST /pause_monitoring`, `POST /resume_monitoring`, `POST /stop_monitoring`: Controlam o estado do processo de monitoramento no backend.
- `POST /set_threshold`: Envia o valor da tolerância de detecção de movimento configurada pelo usuário.
- `GET /get_recovery_email`, `POST /update_recovery_email`: Obtêm e atualizam o endereço de e-mail configurado para recuperação de senha e alertas.
- `POST /change_password`: Permite que um usuário autenticado altere sua senha.
- `POST /request_password_reset`, `POST /verify_password_reset_code`, `POST /reset_password`: Implementam o fluxo de recuperação de senha.
**Nota:** Conforme observado no código, estes endpoints de recuperação *não* utilizam autenticação JWT, o que é esperado para um fluxo pré-login, mas a implementação de segurança no backend para este fluxo já deve ter sido revisada ao ler isso.

### Gerenciamento de Estado e Efeitos Colaterais

- Utilização extensiva de React hooks (`useState`, `useEffect`, `useCallback`) para gerenciar o estado da UI, dados de formulário, estado do monitoramento, lista de capturas, etc.
- `useEffect` é usado para inicializar o fetch do feed de vídeo, configurar o polling de alertas e carregar configurações iniciais (como o e-mail de recuperação).
- `useCallback` é empregado para memorizar funções de handler (login, salvar configurações, etc.) e evitar recriações desnecessárias, otimizando a performance.

### Interface do Usuário

- Construída utilizando componentes da Shadcn UI, estilizados com Tailwind CSS.
- Implementa um design responsivo para adaptar-se a diferentes tamanhos de tela.
- Utiliza o hook `useToast` (baseado em Shadcn UI) para exibir notificações ao usuário.

## Como Executar

1.  **Navegue até a pasta do frontend:**
    ```bash
    cd vigia-frontend
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

O servidor estará rodando em `http://localhost:8597` por padrão.

**Notas:
- Caso a webcan seja desconectada enquanto o monitoramento estiver ativo ou pausado, o monitoramento precisa ser parado e reconectado a webcan para então ser iniciado o monitoramento novamente.

- O modelo `multipart/x-mixed-replace` como o frontend processa stream funciona em desktops e mobile/android. Porém por conta dos motores de navegação em mobile/ios o feed da câmera não entrega o processamento de video em tempo real, apenas os registros de movimento capturados. Portanto, para utilização dos botoes de controle, o Feed de video deve ficar minimizado. Mas pode ficar em expansão caso não haja uso dos botoes de controles.



