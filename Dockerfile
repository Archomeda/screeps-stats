FROM nikolaik/python-nodejs:python3.6-nodejs12

ENV ELASTICSEARCH=1

WORKDIR /screeps-stats

RUN apt-get update && \
    apt-get install -y apt-transport-https ca-certificates && \
    wget -qO - https://packages.elastic.co/GPG-KEY-elasticsearch | apt-key add - && \
    echo "deb [arch=amd64] https://packages.elastic.co/curator/5/debian9 stable main" > /etc/apt/sources.list.d/curator.list && \
    apt-get update && \
    apt-get install -y elasticsearch-curator && \
    rm -rf /var/lib/apt/lists/*

COPY screeps/package.json .
RUN npm install

COPY screeps .
COPY .screeps.yaml .

CMD node index.js
