# Estágio de construção
FROM oven/bun:1 as builder

# Define um argumento de build para a URL do backend
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de configuração e lock file
COPY package.json bun.lockb ./

# Instala as dependências
RUN bun install

# Copia o restante do código do frontend
COPY . .

# Constrói a aplicação, garantindo que a variável de ambiente seja usada
RUN bun run build

# Estágio de produção (servir arquivos estáticos)
FROM nginx:alpine

# Copia os arquivos construídos do estágio anterior para o diretório de serviço do Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Altera o proprietário dos arquivos para o usuário nginx para evitar erros de permissão
RUN chown -R nginx:nginx /usr/share/nginx/html

# Copia uma configuração customizada do Nginx (opcional, mas útil para SPAs)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expõe a porta padrão do Nginx
EXPOSE 80

# Comando para iniciar o Nginx
CMD ["nginx", "-g", "daemon off;"]
