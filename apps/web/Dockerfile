FROM node:22-alpine
RUN apk add --no-cache ffmpeg python3
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
COPY packages/database/ /app/packages/database/
COPY packages/providers/ /app/packages/providers/
COPY services/render-worker/ /app/services/render-worker/
RUN npm run build
EXPOSE 3000
CMD ["npm", "start", "--", "-H", "0.0.0.0"]
