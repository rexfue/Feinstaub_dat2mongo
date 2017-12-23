/**
 * Daten der bisherigen DBase in die neue Struktur kopieren
 * 
 * 	V 1.0  2010-10-15  rxf
 * 		- start
 */

const STARTDATE='2017-12-19';
const NBROFDAYS=1;

var request = require('request');
var moment = require('moment');
var MongoClient = require('mongodb').MongoClient;

const DEST_MONGO_URL = 'mongodb://localhost'+':'+27020+'/Feinstaubi_A';  	// URL to mongo database
const SRC_MONGO_URL = 'mongodb://localhost'+':'+27020+'/Feinstaub';  	    // URL to mongo database

var srcdBase = null;
var destdBase = null;
var start = moment();
var end;

MongoClient.connect(SRC_MONGO_URL)
	.then((db) => {
        srcdBase = db;
        return MongoClient.connect(DEST_MONGO_URL);
    })
	.then((db) => {
        destdBase = db;
        getAllCollections();
    })
	.catch((e) => console.loog(e));


console.log("\n\rStart: ", moment().format("YYYY-MM-DD HH:mm"));

/*
const loop = (arr, fn, busy, err, i=0) => {
	  const body = (ok,er) => {
	    try {const r = fn(arr[i], i, arr); r && r.then ? r.then(ok).catch(er) : ok(r)}
	    catch(e) {er(e)}
	  }
	  const next = (ok,er) => () => loop(arr, fn, ok, er, ++i)
	  const run  = (ok,er) => i < arr.length ? new Promise(body).then(next(ok,er)).catch(er) : ok()
	  return busy ? run(busy,err) : new Promise(run)
	}
*/

// Alle collections einlesen
function getAllCollections() {
	srcdBase.listCollections().toArray(function(err, collInfos) {
		var sids = [];
		for (var i=0; i<collInfos.length; i++) {
			var name = collInfos[i].name;
			if (name.startsWith('data')) {
				var a = name.split('_');
				sids.push([a[1], name]);
			}
		}
		doTheCopy(sids).then(() => {
			srcdBase.close();
			destdBase.close();
			consolen.log("All thu")});
	});
}

async function doTheCopy(ids) {
	for (let i=0; i< ids.length; i++) {
		let colls = srcdBase.collection(ids[i][1]);
        let colld = destdBase.collection(ids[i][1]);
        let std = moment.utc(STARTDATE);
        let endd = moment.utc(STARTDATE);
        endd.add(NBROFDAYS, 'day');
        let docs = await colls.find({date: {$gte: new Date(std), $lt: new Date(endd)}}).toArray();
		let count = await colls.count();
		console.log(i,ids[i],docs[0]);
		console.log("cnt: ",count);
		var entries = [];
		for (k=0; k< docs.length; k++) {
			let ddoc = await colld.findOne({datetime: docs[k].date});
			if(ddoc == null) {
                entries.push(parseDocs(docs[k]));
            }
		}
		let inserted = await colld.insertMany(entries);
		console.log("Inserted:", inserted);
	}
}

function parseDocs(doc) {
	var erg = {};
	
	erg.datetime = doc.date;
	if(doc.P10 != undefined) {
		erg.P1 = doc.P10;
	}
	if(doc.P2_5 != undefined) {
		erg.P2 = doc.P2_5;
	}
	if(doc.temperature != undefined) {
		erg.temperature = doc.temperature;
	}
	if(doc.humidity != undefined) {
		erg.humidity = doc.humidity;
	}
	if(doc.pressure != undefined) {
		erg.pressure = doc.pressure;
	}
	return erg;
}

