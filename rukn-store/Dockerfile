FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data", "/app/uploads"]
CMD ["node", "server.js"]
