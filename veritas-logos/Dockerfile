# Serves the website and API from one container. Build dist/ and dist-server/ first (npm run build).
FROM node:22-slim
WORKDIR /app
COPY dist ./dist
COPY dist-server ./dist-server
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/veritas.db
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "--no-warnings", "dist-server/server.js"]
