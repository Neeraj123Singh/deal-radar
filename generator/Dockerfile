FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
CMD ["npm", "start"]
