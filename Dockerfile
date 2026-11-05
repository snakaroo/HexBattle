FROM node:26.13.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node index.html style.css game.js engine.js server.js ./
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=3000 DB_PATH=/data/matches.sqlite
EXPOSE 3000
CMD ["node", "server.js"]
