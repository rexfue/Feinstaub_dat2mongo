/**
 * Versuch, die Daten per Javascript / Node in die Mongodb einzulesen
 * Datenbank ist aufgebaut wie die alte, d.h. jeder Sensor hat eine eigene Collection !
 * Beim Schreiben muss dafür optimiert werde; beim Lesen ist das wesentlich besser
 * 
 * 	V 1.0  2010-10-31  rxf
 * 		- start
 */

const LIVE=true;


const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');

const MONGO_URL = 'mongodb://localhost'+':'+27018+'/Feinstaub';  	// URL to mongo database
const API_URL = 'https://api.luftdaten.info/static/v1/data.json';	// URL to API on 'liftdate.info'
const SAVE_NAME = 'data/aktdata.json';								// filename for actual data

let dBase = null;
let start = moment();
let end, end1;
let icount=0;
let dcount=0;
let allcount=0;

console.log("\n\rStart: ", start.format("YYYY-MM-DD HH:mm"));


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    dBase = db;
    startProgram();
});



function startProgram() {
    if (LIVE == true) {
        doReadfromAPI();
    } else {
        constructDBaseEntries(readDatafromFile());
    }
}



function doReadfromAPI() {
    request(API_URL, function(error, response, body) {
        let jsBody;
        console.log('error:', error); // Print the error if one occurred
        console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        end = moment();
        try {
            jsBody = JSON.parse(body);
            console.log("1-Dauer read from net: ", end - start);
            saveDatatoFile(JSON.stringify(jsBody));
            end1 = moment();
            console.log("1-Dauer save to Disk: ", end1 - start);
            constructDBaseEntries(jsBody);
        } catch (err) {
            request('https://api.luftdaten.info/static/v1/data.json', function (error, response, body) {
                console.log('error:', error); // Print the error if one occurred
                console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
                try {
                    jsBody = JSON.parse(body);
                    console.log("2-Dauer read from net: ", end - start);
                    saveDatatoFile(JSON.stringify(jsBody));
                    end1 = moment();
                    console.log("2-Dauer save to Disk: ", end1 - start);
                    constructDBaseEntries(jsBody);
                } catch (err) {
                    console.log(err)
                }
            });
        }
    });
}

// var obj = objArray.find(function (obj) { return obj.id === 3; });

// die Daten in eimnr Datei zwischenspeichern
function saveDatatoFile(data) {
    fs.writeFileSync(SAVE_NAME,data);
}

// Daten wieder vom File lesen
function readDatafromFile() {
    return JSON.parse(fs.readFileSync(SAVE_NAME));
}


function constructDBaseEntries(body) {
	console.log("Dauer bis Aufruf zum Parsen: ",moment()-start)
	let allEntries = [] ;
	let st1 = moment();
	for (let i=0; i<body.length; i++) {
		let entry = {};
		let val = [];
        let idx = allEntries.findIndex( function(obj) { return obj.sid === body[i].sensor.id; });
		if (idx != -1) {
            val = allEntries[idx].values;
		} else {
            allEntries.push({'sid':body[i].sensor.id, 'values':val});
            idx = allEntries.length-1;
		}
		let date = moment.utc(body[i].timestamp);
		entry.date = date.toDate();					// make date for Mongo (== ISODate)
		let values = body[i].sensordatavalues;
		for (let n=0; n< values.length; n++) {
			let typ = values[n].value_type;
			let x = 0.0;
			try {
				x = parseFloat(values[n].value);
			} catch (err) {
				console.log(err);
			}
			entry[typ] = x;
		}
		let x=true;
		for(let n=0; n<val.length; n++) {
			if(date.isSame(val[n].date)) {
				delete entry.date;
				for (var k in entry) {
					val[n][k] = entry[k];
				};
				x=false;
				break;
			}
		}
		if(x==true) {
			val.push(entry);
        }
		allEntries[idx].values = val;
	}
    allcount = allEntries.length;
//	console.log(allEntries);
	let los = moment();
	console.log("Parsen dauert:", los-st1);

    doTheEntry(allEntries).then(() => {
        dBase.close();
        console.log("Schreiben in dBase: ", moment()-los);
        console.log("Gesamtzeit: ", moment()-start);
        console.log("icount=",icount,"  dcount=",dcount, "  allcount:",allcount);
        console.log("All thru")});
/*	dBase.collection("fst").findOne({date: allEntries[0].date}, function(err,result) {
		if(err) throw err;
		if (result === null) {
			dBase.collection("fst").insertMany(allEntries, function(err,res) {
			    if (err) throw err;
			    console.log("Number of documents inserted: " + res.insertedCount);
			    dBase.close();
			    console.log("DBase.Insert dauert: ", moment()-los);
			    });
		} else {
			console.log("Data already in dbase");
		}
	});
*/
}

/*

const collections = await db.collections();
if (!collections.map(c => c.s.name).includes(collName)) {
    await db.createCollection(collName);
}

 */

async function doTheEntry(entries) {
    const collections = await dBase.collections();
    for (let i=0; i< entries.length; i++) {
        if (!collections.map(c => c.s.name).includes('data_'+ entries[i].sid)) {
            console.log("New Collection: data_"+entries[i].sid);
        }
        var coll = dBase.collection('data_'+ entries[i].sid);
        let doc = await coll.findOne({date:entries[i].values[0].date});
        if(doc == null) {
            let inserted = await coll.insertMany(entries[i].values);
            icount += inserted.insertedCount;
//            console.log("Inserted:", inserted.insertedCount);
		} else {
//            console.log("schon drin");
            dcount += entries[i].values.length;
        }
    }
}
/*
//https://zeit.co/blog/async-and-await
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Usage!
sleep(500).then(() => {
    // Do something after the sleep!
});

*/