FROM node:22-alpine
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
COPY packages/database/ /app/packages/database/
COPY packages/providers/ /app/packages/providers/
RUN npm run build
EXPOSE 3000
CMD ["npm", "start", "--", "-H", "0.0.0.0"]
