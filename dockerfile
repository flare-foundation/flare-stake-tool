FROM node:18 as build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY ./src /app/src
COPY tsconfig.json .
RUN yarn run build

FROM node:18-alpine

WORKDIR /app

COPY ./bin /app/bin
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

ENTRYPOINT [ "/app/bin/flare-stake-tool" ]
