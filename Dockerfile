FROM nikolaik/python-nodejs:python3.6-nodejs12

ENV ELASTICSEARCH=1

WORKDIR /screeps-stats

RUN pip install elasticsearch-curator

COPY screeps/package.json .
RUN npm install

COPY screeps .
COPY .screeps.yaml .

CMD node index.js
