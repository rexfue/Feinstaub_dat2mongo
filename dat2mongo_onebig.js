/**
 * Versuch, die Daten per Javascript / Node in die Mongodb einzulesen
 * Datenbank ist neu Aufgebaut: es gibt nur eine einzige collection
 * Diese hat als Haupt-Index die Sensor-Nummer, als zweiten Index das Datum der Werrte
 *
 * 	V 1.0  2010-11-26  rxf
 * 		- start
 */

/* <<<<<<<<<<<<<<TODO
    - 24h-gleitenden Mittelwert laufend mitrechnen
    - diesen immer um 0h00 (UTC !!!!) extra als Tagesmittewert abspeichern und in
      eine eigen collection eintragen
 */

/* Aufbau der DBase:
    sid: 245,
    type:
        [
            {
                name:	DHT22,
                date_since: 2017-11-03,
            },
            { … }
        ],
    location:
        [
            {
                id: 1234,
                lat:  9.1777,
                lon: 47.567,
                alt:  280,
                date: 2017-11-03,
                addr:
                    {
                        street:  'Forststr. 66a',
                        plz: 70176.
                        city:  'Stuttgart'
                        country: 'Germany'
                    },
                    {,,, }
        ],
    othersensors:
        [
            241,
            345
        ],
    values:
        [
            {
                datetime: 271-11-03T12:34:00Z,
                p1: 12.56,
                p2: 34.67,
                p1mva24: 10.67,
                p2mva24: 35.66
            },
            {
                datime:
                p1:
                p2:
                p1mva24:
                p2mva24:
            },
            {,,. },
            ....
            ....
        ],
    dayvalues:
        [
            {
                p1: 23.45
                p2: 34.56
                date: 2017-11-26,
            },
            { ... },
            ....
            ....
         ]
 */

const LIVE=true;


const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');

let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST == undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT == undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaub';  	// URL to mongo database
const API_URL = 'https://api.luftdaten.info/static/v1/data.json';	// URL to API on 'luftdaten.info'
const API24_URL = 'https://api.luftdaten.info/static/v2/data24h.json';	// URL to API on 'luftdaten.info'
const SAVE_NAME = 'data/aktdata.json';								// filename for actual data

let dBase = null;
let start = moment();
let end, end1;
let icount=0;
let ucount=0;
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
            request(API_URL, function (error, response, body) {
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
	let allValues = [] ;
	let allKorrel = [] ;
	let st1 = moment();
	for (let i=0; i<body.length; i++) {
		let entry = {};
		let val = [];
        let idx = allValues.findIndex( function(obj) { return obj.sid === body[i].sensor.id; });
		if (idx != -1) {
            val = allValues[idx].values;
		} else {
            allValues.push({'sid':body[i].sensor.id, 'values':val});
            idx = allValues.length-1;
		}
		let date = moment.utc(body[i].timestamp);
		entry.datetime = date.toDate();					// make date for Mongo (== ISODate)
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
			if(date.isSame(val[n].datetime)) {
				delete entry.datetime;
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
		allValues[idx].values = val;
        allValues[idx].location = body[i].location;
        allValues[idx].type = { name: body[i].sensor.sensor_type.name, date_since : moment().toDate()};
    }
    allcount = allValues.length;
//	console.log(allValues);
	let los = moment();
	console.log("Parsen dauert:", los-st1);

    doTheEntry(allValues).then(() => {
        dBase.close();
        let gz =  moment()-los;
        console.log("Schreiben in dBase: ",  gz ,'msec  ', minsec(gz));
        gz = moment()-start;
        console.log("Gesamtzeit: ", gz ,'msec  ', minsec(gz));
        console.log("icount=",icount,"  ucount=",ucount, "  allcount:",allcount);
        console.log("All thru")});
/*	dBase.collection("fst").findOne({date: allValues[0].date}, function(err,result) {
		if(err) throw err;
		if (result === null) {
			dBase.collection("fst").insertMany(allValues, function(err,res) {
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
//    const collections = await dBase.listCollections().toArray();
    for (let i=0; i< entries.length; i++) {
        let entry = entries[i];
        if(entry.sid == 140) {
            console.log("140 gefunden");
        }
        let sid = entry.sid;
        var coll = dBase.collection('allsids');
        let doc = await coll.findOne({sid: sid},{_id:0, sid:1, 'values.datetime':1});
        if (doc == null) {
            console.log("New Sensor:",sid);
            // hier dann Adresse und Höhe von Google holen und mit abspeichern
            let inserted = await coll.insert(entry);
            icount += inserted.insertedCount;
            let x = await coll.ensureIndex({sid: 1});
//            console.log('Index_sid: ', x);
            x = await coll.ensureIndex({'values.datetime':1});
//            console.log('Index_datetime: ', x);
        } else {
            let dv_values = doc.values.slice(-5)
            for (let n=0; n<entry.values.length; n++) {
                let ed = entry.values[n].datetime.getTime();
                let doit = true;
                for (let k=0; k<dv_values.length; k++) {
                    let dvd = dv_values[k].datetime.getTime();
                    if(dvd == ed) {
                        doit = false;
                        break;
                    }
                }
                if (doit) {
                    let updated = await coll.update({sid: entry.sid},{ $push: {values: entry.values[n]}})
                    ucount += 1;
 //               } else {
 //                   console.log(entry.sid, 'doppeltes Datum');
                }
            }
        }
    }
}

// Umrechnen der msec in minuten und Sekunden und als String zurückgeben
function minsec(msec) {
    min = (msec/60000).toFixed(0);
    msec -= min*60000;
    sec = (msec/1000).toFixed(2);
    return(min+':'+sec+ ' min:sec');
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