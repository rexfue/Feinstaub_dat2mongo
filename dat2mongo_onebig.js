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

      Adaptieren an ECMA6 !!
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
                datetime: 2071-11-03T12:34:00Z,
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
    console.log("Dauer bis Aufruf zum Parsen: ", moment() - start)
    let allValues = [];
    let allKorrel = [];
    let st1 = moment();
    for (let i = 0; i < body.length; i++) {                         // check all entries
        let entry = {};
        let val = [];                                           // is sid alredy in array
        let idx = allValues.findIndex(function (obj) {
            return obj.sid === body[i].sensor.id;
        });
        if (idx != -1) {                                        // yes
            val = allValues[idx].values;                        // so read current values
        } else {                                                // no
            allValues.push({'sid': body[i].sensor.id, 'values': val});  // so push  sid and empty values
            idx = allValues.length - 1;                         // adjust index
            allValues[idx].othersensors = [];                   // init array for the other sensors on same location
        }
        let date = moment.utc(body[i].timestamp);               // extract date of entry
        entry.datetime = date.toDate();					        // make date for Mongo (== ISODate)
        let values = body[i].sensordatavalues;                  // fetch values
        for (let n = 0; n < values.length; n++) {                  // for all values
            let typ = values[n].value_type;                     // extract type
            let x = 0.0;                                        // bdefault for value
            try {
                x = parseFloat(values[n].value);                // extract value
            } catch (err) {
                console.log(err);
            }
            entry[typ] = x;                                     // put typ and value into new entry
        }
        let x = true;                                             // set flag
        for (let n = 0; n < val.length; n++) {                       // for all values in this entry
            if (date.isSame(val[n].datetime)) {                  // if the same date is aready entered
                delete entry.datetime;                          // delete it
                for (var k in entry) {                          // and enter the typ and value
                    val[n][k] = entry[k];
                }
                ;
                x = false;                                        // clear flag
                break;
            }
        }
        if (x == true) {                                           // if flag set (after loop)
            val.push(entry);                                    // push te entry, else is is already entered
        }
        allValues[idx].values = val;                            // now push alll into the big array
        allValues[idx].type = {name: body[i].sensor.sensor_type.name, date_since: moment().toDate()}; // and sensortype
        allValues[idx].location = body[i].location;             // and add the location
        let fnd = allValues.findIndex(function (obj) {
            return obj.location.id === body[i].location.id;
        });
        if ((fnd != -1) && (fnd != idx)) {                      // same location -> korrelate (skip own sid)
            if((allValues[fnd].othersensors).indexOf(body[i].sensor.id) == -1) {  // if not already stored
                allValues[fnd].othersensors.push(body[i].sensor.id);  // enter sid
            }
        }
    }
    allcount = allValues.length;                                // so many elents were adde9d

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

// Put all data into the database
async function doTheEntry(entries) {
    let coll = dBase.collection('allsids');                     // this collection is used
    for (let i=0; i< entries.length; i++) {                     // loop for every entry
        let entry = entries[i];                                 // save typing !
        let sid = entry.sid;                                    // sid of current entry
        let doc = await coll.findOne({sid: sid},{_id:0, sid:1, 'values.datetime':1});   // try to fetch document with ..
        // <================ Hier max. eine Tag zurück ab jetzt einlesen, darüber dann den Mittelwert bilden -> 24h average
        if (doc == null) {                                      // ..current sid
            console.log("New Sensor:",sid);                     // not found => log it
            // <==================== hier dann Adresse und Höhe von Google holen und mit abspeichern
            let inserted = await coll.insert(entry);            // so insert the whole entry as is
            icount += inserted.insertedCount;                   // count inserted records
            let x = await coll.ensureIndex({sid: 1});           // and create the indexes
            x = await coll.ensureIndex({'values.datetime':1});
        } else {                                                // sid is found in dbase
            let dv_values = doc.values.slice(-5)                // extract the last newest 5 value records
            for (let n=0; n<entry.values.length; n++) {         // loop over all new value-dates
                let ed = entry.values[n].datetime.getTime();    // make timestamp
                for (let k=0; k<dv_values.length; k++) {        // loop over the last (max) 5 values from the DB
                    let dvd = dv_values[k].datetime.getTime();  // make timestamp
                    if(dvd == ed) {                             // compare
                        entry.values.splice(n,1);               // if equal, delete in entry
                        n=-1;
                        break;
                    }
                }
            }
            if(entry.values.length > 0) {
                let updated = await
                coll.update({sid: entry.sid}, {$push: {values: { $each: entry.values}}})  // store it ..
                ucount += 1;                                // .. -> update the record; count updated
            }
        }
        // <======  Checklen, ob der Tag um ist. Wenn ja, den letzten Mittelwert als Tages-Mittel
        // speichern (bezogen auf UTC!)
    }
}

// Umrechnen der msec in minuten und Sekunden und als String zurückgeben
function minsec(msec) {
    min = Math.floor((msec/60000));
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