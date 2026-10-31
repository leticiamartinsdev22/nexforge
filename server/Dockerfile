FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache postgresql16-client restic && npm ci --omit=dev && mkdir -p /app/data && chown node:node /app/data
COPY src ./src
ENV NODE_ENV=production
ENV RESTIC_CACHE_DIR=/tmp/restic-cache
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]

