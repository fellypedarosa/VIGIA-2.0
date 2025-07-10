# Use uma imagem base Python
FROM python:3.11-slim

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Instala as dependências do sistema necessárias para o OpenCV
# libgl1 fornece a biblioteca libGL.so.1
# libglib2.0-0 fornece libgthread-2.0.so.0
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copia o arquivo de requisitos e instala as dependências
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código da aplicação
COPY . .

# Expõe a porta que a aplicação usa
EXPOSE 5000

# Comando para rodar a aplicação
CMD ["python", "app.py"]
