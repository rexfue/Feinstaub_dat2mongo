/**
 * Füpr alle collections die TTL auf 32 Tage setzen
 * 
 * 	V 1.0  2017-12-20  rxf
 * 		- start
 */


// Aufbau der verschiednen Ciollections sie im doc-Verzeichnis


const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
// const lc = require('./locationcheck.js');


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST == undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT == undefined) { MONGOPORT =  27018; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaub';  	// URL to mongo database



console.log("\n\rStart: ", moment().format("YYYY-MM-DD HH:mm"));


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    startProgram(db);
});



function startProgram(db) {
    setTTL(db).then(() => {
        console.log("All done!",moment().format("YYYY-MM-DD HH:mm"));
        db.close();
    });
}





async function setTTL(dbase,start) {
    const collections = await dbase.listCollections().toArray();    // read all collection names
    for (let i = 0; i < collections.length; i++) {                     // loop through all collections
        console.log(collections[i].name);
        var coll = dbase.collection(collections[i].name);                     // use this collection
        let erg = await coll.indexExists('date_1');
        if (erg == true) {
            await coll.dropIndex('date_1');
        }
        await coll.createIndex({ date:1}, { expireAfterSeconds: 2764800});  // expire after 32 days
//        console.log(collections[i].name);
    }
}
