# Vigia - Backend Technical README

Este é o backend do sistema de monitoramento Vigia. Ele é responsável por acessar a webcam, detectar movimento, e fornecer um feed de vídeo e alertas para o frontend.

## Tecnologias

- **Python 3**
- **Flask:** Um micro-framework web para criar a API.
- **OpenCV:** Biblioteca de visão computacional usada para acessar a câmera e detectar movimento.
- **Flask-CORS:** Extensão para lidar com Cross-Origin Resource Sharing (CORS).

O servidor estará rodando em `http://localhost:5000` por padrão. O frontend deve ser configurado para se conectar a este endereço (o que é feito automaticamente pelo script `setup_dev.sh`).

## Endpoints da API

- `GET /video_feed`: Fornece o stream de vídeo MJPEG com a detecção de movimento.
- `GET /check_alerts`: Endpoint usado pelo frontend para verificar se há novos alertas de movimento.
- `POST /set_threshold`: Permite que o frontend defina a sensibilidade (tolerância) para a geração de alertas.
- `GET /start_monitoring`: Inicia o monitoramento.
- `GET /stop_monitoring`: Para o monitoramento.
- `POST /login`: Para autenticar usuários.
- `GET /pause_monitoring`: Para pausar o processamento de detecção de movimento.
- `GET /resume_monitoring`: Para retomar o processamento de detecção de movimento.
- `GET /get_recovery_email`: Para obter o email de recuperação configurado.
- `POST /update_recovery_email`: Para atualizar o email de recuperação.
- `POST /request_password_reset`: Para solicitar um código de recuperação de senha.
- `POST /test_smtp_connection`: Para testar as configurações de conexão SMTP.
- `GET /get_smtp_config`: Para obter as configurações SMTP atuais.
- `POST /update_smtp_config`: Para atualizar as configurações SMTP.
- `POST /verify_password_reset_code`: Para verificar um código de recuperação de senha.
- `POST /reset_password`: Para redefinir a senha usando um código válido.
- `POST /change_password`: Para mudar a senha do usuário logado.
- `GET /test`: Endpoint simples para verificar se o servidor está funcionando.

## Segurança

O backend do Vigia implementa as seguintes medidas de segurança:

- **Autenticação JWT:** Utiliza Flask-JWT-Extended para proteger endpoints, garantindo que apenas usuários autenticados com um token válido possam acessá-los.
- **Hashing de Senha:** As senhas dos usuários são armazenadas no banco de dados usando hashing seguro com Flask-Bcrypt, impedindo o armazenamento de senhas em texto simples.
- **Verificação Segura de Senha:** A comparação de senhas é feita utilizando a função de verificação do Bcrypt, que compara o hash da senha fornecida com o hash armazenado de forma segura.
- **Recuperação de Senha:** O processo de recuperação de senha utiliza códigos temporários com expiração curta, armazenados de forma segura no banco de dados.
- **CORS:** Configurado para controlar o acesso entre o frontend e o backend, aumentando a segurança contra requisições de origens não permitidas.
- **Banco de Dados SQLite:** Utilizado para armazenar dados de usuários e tokens de recuperação de forma local.

## Como Executar

1.  **Navegue até a pasta do backend:**
    ```bash
    cd vigia-backend
    ```

2.  **Crie e ative um ambiente virtual:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Instale as dependências:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Inicie o servidor:**
    ```bash
    python app.py
    ```
