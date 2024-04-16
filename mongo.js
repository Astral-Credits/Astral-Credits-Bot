const { MongoClient, ServerApiVersion } = require('mongodb');

const client = new MongoClient(process.env.mongo_connection_string, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const tipbot_client = new MongoClient(process.env.tipbot_mongo_connection_string, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

module.exports = {
  getDb: async function() {
    await client.connect();
    return [client.db("db"), tipbot_client.db("db")];
  },
};
