FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --no-audit

COPY . .

EXPOSE 8181-8182

CMD npm start


