/**
 * Daten der bisherigen DBase in die neue Struktur kopieren
 * 
 * 	V 1.0  2010-10-15  rxf
 * 		- start
 */

var request = require('request');
var moment = require('moment');
var MongoClient = require('mongodb').MongoClient;

const DEST_MONGO_URL = 'mongodb://localhost'+':'+27017+'/Feinstaub';  	// URL to mongo database
const SRC_MONGO_URL = 'mongodb://localhost'+':'+27018+'/Feinstaub';  	    // URL to mongo database

var srcdBase = null;
var destdBase = null;
var start = moment();
var end;

MongoClient.connect(SRC_MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    srcdBase = db;
    getAllCollections();

});

MongoClient.connect(DEST_MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    dstdBase = db;
});

console.log("\n\rStart: ", moment().format("YYYY-MM-DD HH:mm"));

const loop = (arr, fn, busy, err, i=0) => {
	  const body = (ok,er) => {
	    try {const r = fn(arr[i], i, arr); r && r.then ? r.then(ok).catch(er) : ok(r)}
	    catch(e) {er(e)}
	  }
	  const next = (ok,er) => () => loop(arr, fn, ok, er, ++i)
	  const run  = (ok,er) => i < arr.length ? new Promise(body).then(next(ok,er)).catch(er) : ok()
	  return busy ? run(busy,err) : new Promise(run)
	}


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
		doTheCopy(sids).then(() => {srcdBase.close(); consolen.log("All thu")});
	});
}

async function doTheCopy(ids) {
	for (let i=0; i< ids.length; i++) {
		var coll = srcdBase.collection(ids[i][1]);
		let docs = await coll.find({}).toArray();
		let count = await coll.count();
		console.log(i,ids[i],docs[0]);
		console.log("cnt: ",count);
		var entries = [];
		for (k=0; k< docs.length; k++) {
			entries.push(parseDocs(docs[k]));
		}
		let inserted = await destdBase.insertMany(entries);
		console.log("Inserted:", inserted);
	}
}

function parseDocs(doc) {
	var erg = {};
	
	erg.date = doc.date;
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


function fetchColl(id) {
	var p = new Promise((res,rej) => {
		var coll = srcdBase.collection(id[1]);
		var docs = coll.find({}).toArray();
		if(docs == null) {
			rej("docs == nulll");
		} else {
			res(docs);
		}
	})
	return p;
}




function constructDBaseEntries(body) {
	var allEntries =  [];
	var st1 = moment();
	for (var i=0; i<body.length; i++) {
		var entry = {};
		var date = moment.utc(body[i].timestamp);
		entry.date = date.toDate();					// make datetime for Mongo (== ISODate)
		entry.sensorid = body[i].sensor.id;
		var values = body[i].sensordatavalues;
		for (var n=0; n< values.length; n++) {
			var typ = values[n].value_type;
			var x = 0.0;
			try {
				x = parseFloat(values[n].value);
			} catch (err) {
				console.log(err);
			}
			entry[typ] = x;
		}
		allEntries.push(entry);
	}
//	console.dir(allEntries);
	var los = moment();
	console.log("Parsen dauert:", los-st1);
	destdBase.collection("fst").findOne({date: allEntries[0].date}, function(err,result) {
		if(err) throw err;
		if (result == null) {
			destdBase.collection("fst").insertMany(allEntries, function(err,res) {
			    if (err) throw err;
			    console.log("Number of documents inserted: " + res.insertedCount);
			    destdBase.close();
			    console.log("DBase.Insert dauert: ", moment()-los);
			    });
		} else {
			console.log("Data already in dbase");
		}
	});
}


