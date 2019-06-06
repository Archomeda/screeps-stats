#!/usr/bin/env node
const { exec } = require('child_process');
const { ScreepsAPI } = require('screeps-api');
const cheerio = require('cheerio');
const ElasticSearch = require('elasticsearch');
const strftime = require('strftime');

let esClient;
let screepsClient;

async function run() {
    exec('/usr/bin/curator --version', (_, stdout) => {
        console.log(stdout);
    });

    setInterval(runCurator, 60 * 60 * 1000);

    esClient = new ElasticSearch.Client({
        host: process.env.ELASTICSEARCH ? 'elasticsearch' : 'localhost'
    });
    screepsClient = new ScreepsAPI(await ScreepsAPI.fromConfig());

    const shardsResponse = (await screepsClient.raw.game.shards.info())['shards'];
    const shards = [];
    for (const shard of Object.values(shardsResponse)) {
        shards.push(shard.name);
    }

    screepsClient.socket.connect();
    screepsClient.socket.on('connected', onConnected);
    screepsClient.socket.on('disconnected', onDisconnected);
    screepsClient.socket.on('subscribe', onSubscribe);
    screepsClient.socket.on('unsubscribe', onUnsubscribe);
    screepsClient.socket.on('auth', onAuth);

    for (const shard of shards) {
        screepsClient.socket.subscribe(`memory/${shard}/stats`, onStats);
    }
    screepsClient.socket.subscribe('cpu', onCpu);
    screepsClient.socket.subscribe('console', onConsole);
}

function runCurator() {
    exec('/usr/bin/curator --config ./curator.yml ./curator-action.yml', (_, stdout, stderr) => {
        console.log(stdout);
        if (stderr) {
            console.error(stderr);
        }
    });
}

function onConnected() {
    console.log('Connected to websocket');
}

function onDisconnected() {
    console.log('Disconnected from websocket');
}

function onSubscribe(e) {
    console.log('Subscribed:', e);
}

function onUnsubscribe(e) {
    console.log('Unsubscribed:', e);
}

function onAuth(e) {
    console.log('Auth:', e);
}

async function onStats(e) {
    if (!e.data || e.data === 'undefined') {
        return;
    }

    const match = e.channel.match(/^memory\/([^\/]*)\/stats$/);
    const shard = match ? match[1] : null;
    const stats = JSON.parse(e.data);
    console.log(`Received ${shard} stats`);

    const tick = stats.tick;
    const timestamp = new Date().toISOString();

    for (const id in stats) {
        if (typeof stats[id] !== 'object') {
            continue;
        }

        const message = {
            timestamp,
            tick,
            ...stats[id]
        };
        if (shard) {
            message.shard = shard;
        }

        await esClient.index({
            index: `screeps-stats-${id}-${strftime('%Y-%m-%d')}`,
            type: 'stats',
            body: message
        });
    }
}

async function onCpu(e) {
    const cpu = e.data;
    console.log('Received cpu:', cpu);

    const timestamp = new Date().toISOString();
    const message = {
        timestamp,
        cpu: cpu.cpu,
        memory: cpu.memory
    };

    await esClient.index({
        index: `screeps-performance-${strftime('%Y-%m-%d')}`,
        type: 'performance',
        body: message
    });
}

async function onConsole(e) {
    const log = e.data;
    if (!log || !log.messages) {
        return;
    }

    const timestamp = new Date().toISOString();

    if (log.messages.log && log.messages.log.length > 0) {
        console.log(`Received ${log.messages.log.length} console logs:`);

        for (const line of log.messages.log) {
            const $ = cheerio.load(line);
            const element = $('log,font')[0];

            const message = {
                timestamp,
                mtype: 'log'
            };
            if (element) {
                // HTML like message
                for (const attrKey in element.attribs) {
                    const float = parseFloat(element.attribs[attrKey]);
                    message[attrKey] = !isNaN(float) ? float : element.attribs[attrKey];
                }
                message.message = $(element).text().trim();
            } else {
                message.message = line.trim();
            }

            if (log.shard) {
                message.shard = log.shard;
            }

            console.log(` - ${message.shard}: ${message.message}`);
            await esClient.index({
                index: `screeps-console-${strftime('%Y-%m-%d')}`,
                type: 'log',
                body: message
            });
        }
    }
    if (log.messages.results && log.messages.results.length > 0) {
        console.log(`Received ${log.messages.results.length} console results:`);

        for (const line of log.messages.results) {
            const message = {
                timestamp,
                mtype: 'results',
                message: line
            };
            if (log.shard) {
                message.shard = log.shard;
            }

            console.log(` - ${message.shard}: ${message.message}`);
            await esClient.index({
                index: `screeps-console-${strftime('%Y-%m-%d')}`,
                type: 'log',
                body: message
            });
        }
    }
    if (log.error) {
        console.log('Received console error:');
        const message = {
            timestamp,
            mtype: 'error',
            message: error
        };
        if (log.shard) {
            message.shard = log.shard;
        }

        console.log(` - ${message.shard}: ${message.message}`);
        await esClient.index({
            index: `screeps-console-${strftime('%Y-%m-%d')}`,
            type: 'log',
            body: message
        });
    }
}

function shutdown() {
    if (screepsClient) {
        screepsClient.socket.disconnect();
    }
    process.exit();
}

process.on('exit', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', e => {
    console.error(e);
    shutdown();
});

run();
