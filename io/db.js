import { MongoClient } from "mongodb";

const DEFAULT_DB_URL = "mongodb://localhost:27017";

async function installDB(dbName, url = DEFAULT_DB_URL) {
  const client = new MongoClient(url);
  await client.connect();
  console.log("Connected successfully to mongodb");
  return client.db(dbName);
}

export default installDB;
