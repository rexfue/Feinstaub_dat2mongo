/**
 * Versuch, die Daten per Javascript / Node in die Mongodb einzulesen
 * Datenbank ist aufgebaut wie die alte, d.h. jeder Sensor hat eine eigene Collection !
 * Beim Schreiben muss dafür optimiert werde; beim Lesen ist das wesentlich besser
 * 
 * 	V 1.0  2010-10-31  rxf
 * 		- start
 */

/* <<<<<<<<<<<<<<TODO
    - 24h-gleitenden Mittelwert laufend mitrechnen
    - diesen immer um 0h00 (UTC !!!!) extra als Tagesmittewert abspeichern und in
      eine eigen collection eintragen
 */

// Aufbau der verschiednen Ciollections sie im doc-Verzeichnis

const LIVE=true;

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
const API_URL = 'https://api.luftdaten.info/static/v1/data.json';	// URL to API on 'luftdaten.info'
const API24_URL = 'https://api.luftdaten.info/static/v2/data24h.json';	// URL to API on 'luftdaten.info'
const SAVE_NAME = 'data/aktdata.json';  // filename for actual data


// Because of restrictions (max. 2500 rquests/day) on Google-Maps-API, we request only 2000 adrresses in one
// batch püer day freom Google.
const LOCATION_TIME = '15:07';                      // Clock-time, when location will be checked


console.log("\n\rStart: ", moment().format("YYYY-MM-DD HH:mm"));


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    startProgram(db);
});



function startProgram(db) {
    let start = moment("2017-12-20T09:00:00Z").toDate();
    changeIt(db,start).then(() => {
        console.log("All done!",moment().format("YYYY-MM-DD HH:mm"));
        db.close();
    });
}





async function changeIt(dbase,start) {
    const collections = await dbase.listCollections().toArray();    // read all collection names
    for (let i = 0; i < collections.length; i++) {                     // loop through all collections
        let coll = dbase.collection(collections[i].name);           // get collection Name
        await coll.updateMany({date: {$gt: start}}, {$rename: {'true': 'P2_5'}})
//        console.log(collections[i].name);
    }
}
