const mongodb = require('mongodb').MongoClient;
let env = require('dotenv');
env.config({ path: '.env' });

const db = mongodb.connect(process.env.MONGO_URI).then(client => {
    console.log('Connected to MongoDB');
    return client.db('code-security-open-source');
}).catch(err => {
    console.log(err);
});
module.exports = {
    db
}