FROM python:2.7

ENV ELASTICSEARCH 1

WORKDIR /screeps-stats

RUN git clone https://github.com/vishnubob/wait-for-it

COPY screeps_etl/requirements.txt .
RUN pip install -r requirements.txt

COPY screeps_etl .
COPY .screeps_settings.yaml .

CMD python screepsstats.py
