#!/bin/bash

set -e

# 1. Backend: criar .env se não existir
if [ ! -f "vigia-backend/.env" ]; then
  echo "Criando vigia-backend/.env de exemplo..."
  cat > vigia-backend/.env <<EOF
JWT_SECRET_KEY=sua_chave_jwt_aqui
RECOVERY_EMAIL=seu_email@exemplo.com
SMTP_SERVER=smtp.seuprovedor.com
SMTP_PORT=465
SMTP_USER=usuario@exemplo.com
SMTP_PASSWORD=sua_senha
EOF
  echo "Edite vigia-backend/.env com seus dados reais."
fi

# 2. Frontend: criar .env se não existir
if [ ! -f "vigia-frontend/.env" ]; then
  echo "Criando vigia-frontend/.env de exemplo..."
  cat > vigia-frontend/.env <<EOF
VITE_API_URL=http://localhost:5000
EOF
  echo "Edite vigia-frontend/.env se o backend não estiver em http://localhost:5000."
fi

# 3. Backend: criar banco de dados se não existir
if [ ! -f "vigia-backend/vigia.db" ]; then
  echo "Criando banco de dados SQLite inicial..."
  sqlite3 vigia-backend/vigia.db < vigia-backend/schema.sql
  echo "Banco de dados criado."
fi

# 4. Backend: instalar dependências Python (opcional, se rodar fora do Docker)
if [ ! -d "vigia-backend/venv" ]; then
  echo "Criando ambiente virtual Python para o backend..."
  python3 -m venv vigia-backend/venv
  source vigia-backend/venv/bin/activate
  pip install -r vigia-backend/requirements.txt
  deactivate
  echo "Dependências Python instaladas."
fi

# 5. Frontend: instalar dependências Node.js
if [ ! -d "vigia-frontend/node_modules" ]; then
  echo "Instalando dependências do frontend..."
  cd vigia-frontend
  npm install || bun install
  cd ..
fi

echo "\nPronto! Agora edite vigia-backend/.env com seus dados reais e rode:"
echo "  docker-compose up --build"
echo "ou rode manualmente os serviços conforme o README."
