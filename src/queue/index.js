const amqp = require('amqplib');

const env = require('../config/env');

const QUEUES = {
  PASSWORD_RESET_EMAIL: 'email.password-reset',
};

let connection = null;
let channel = null;

const connectQueue = async () => {
  if (channel) {
    return channel;
  }

  connection = await amqp.connect(env.rabbitmq.url);

  connection.on('error', (error) => {
    console.error('[RABBITMQ ERROR]', error.message);
  });

  connection.on('close', () => {
    console.error('[RABBITMQ] koneksi tertutup');
    connection = null;
    channel = null;
  });

  channel = await connection.createChannel();

  await channel.assertQueue(QUEUES.PASSWORD_RESET_EMAIL, { durable: true });

  return channel;
};

const publish = async (queue, payload) => {
  const activeChannel = await connectQueue();

  return activeChannel.sendToQueue(
    queue,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true, contentType: 'application/json' }
  );
};

const closeQueue = async () => {
  if (channel) {
    await channel.close();
    channel = null;
  }

  if (connection) {
    await connection.close();
    connection = null;
  }
};

module.exports = { QUEUES, connectQueue, publish, closeQueue };