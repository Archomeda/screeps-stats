FROM python:2.7

WORKDIR /screeps-stats

ENV ELASTICSEARCH 1

COPY screeps_etl/requirements.txt .
RUN pip install -r requirements.txt

COPY screeps_etl .
COPY .screeps_settings.yaml .

RUN git clone https://github.com/vishnubob/wait-for-it

CMD python screepsstats.py
