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
if (MONGOPORT == undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaub';  	// URL to mongo database
const API_URL = 'https://api.luftdaten.info/static/v1/data.json';	// URL to API on 'luftdaten.info'
const API24_URL = 'https://api.luftdaten.info/static/v2/data24h.json';	// URL to API on 'luftdaten.info'
const SAVE_NAME = 'data/aktdata.json';  // filename for actual data


// Because of restrictions (max. 2500 rquests/day) on Google-Maps-API, we request only 2000 adrresses in one
// batch püer day freom Google.
const LOCATION_TIME = '15:07';                      // Clock-time, when location will be checked

let dBase = null;
let start = moment();
let end, end1;
let icount=0;
let dcount=0;
let allcount=0;

// fix date 'date_since'
const D1900 = moment('1900-01-01').toDate();
const defaultAddress = {
    number: '6',
    city: 'S',
    region: 'BW',
    country: 'DE',
    plz: 70176,
    street: 'Fo'
}

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
    for (let i = 0; i < body.length; i++) {                     // check all entries
        let entry = {};
        let val = [];                                           // is sid alredy in array
        let idx = allValues.findIndex(function (obj) {
            return obj.sid === body[i].sensor.id;
        });
        if (idx != -1) {                                        // yes
            val = allValues[idx].values;                        // -> read current values
        } else {                                                // no
            allValues.push({'sid': body[i].sensor.id, 'values': val});  // -> push  sid and empty values
            idx = allValues.length - 1;                         // adjust index
//            allValues[idx].properties = {};
//            allValues[idx].properties.othersensors = [];        // init array for the other sensors on same location
        }
        let date = moment.utc(body[i].timestamp);               // extract date of entry
        entry.datetime = date.toDate();					        // make date for Mongo (== ISODate)
        let values = body[i].sensordatavalues;                  // fetch values
        for (let n = 0; n < values.length; n++) {               // for all values
            let typ = values[n].value_type;                     // extract type
            let x = 0.0;                                        // bdefault for value
            try {
                x = parseFloat(values[n].value);                // extract value
            } catch (err) {
                console.log(err);
            }
            entry[typ] = x;                                     // put typ and value into new entry
        }
        let x = true;                                           // set flag
        for (let n = 0; n < val.length; n++) {                  // for all values in this entry
            if (date.isSame(val[n].datetime)) {                 // if the same date is aready entered
                delete entry.datetime;                          // delete it
                for (var k in entry) {                          // and enter the typ and value
                    val[n][k] = entry[k];
                }
                ;
                x = false;                                      // clear flag
                break;
            }
        }
        if (x == true) {                                        // if flag set (after loop)
            val.push(entry);                                    // push the entry, else it is already entered
        }
        allValues[idx].values = val;                            // now push all into the big array
        let properties = {
            sid:  body[i].sensor.id,
            name: body[i].sensor.sensor_type.name,
            date_since: D1900,
            location: {
                loc: {
                    type: "Point",
                    coordinates: [checkLatLon(body[i].location.longitude), checkLatLon(body[i].location.latitude)]
                },
                altitude: 0,
                address: defaultAddress
            },
            othersensors : [],
        }
        allValues[idx].properties = properties;
        let fnd = allValues.findIndex(function (obj) {
            return obj.properties.location.id === body[i].location.id;
        });
        if ((fnd != -1) && (fnd != idx)) {                      // same location -> korrelate (skip own sid)
            if((allValues[fnd].properties.othersensors).indexOf(body[i].sensor.id) == -1) {  // if not already stored
                allValues[fnd].properties.othersensors.push(body[i].sensor.id);  // enter sid
            }
            let fndsid = allValues[fnd].sid;
            if((allValues[idx].properties.othersensors).indexOf(fndsid) == -1) {  // if not already stored
                allValues[idx].properties.othersensors.push(fndsid);  // enter sid
            }
        }
    }
    allcount = allValues.length;                                // so many elents were adde9d

//	console.log(allValues);
	let los = moment();
	console.log("Parsen dauert:", los-st1);

    doTheEntry(allValues).then(() => {
//        let now = moment();
//        if (now.format('HH:mm') == LOCATION_TIME) {
//            await lc.locationcheck(dBase);
//        }
        dBase.close();
        let gz =  moment()-los;
        console.log("Schreiben in dBase: ",  gz ,'msec  ', minsec(gz));
        gz = moment()-start;
        console.log("Gesamtzeit: ", gz ,'msec  ', minsec(gz));
        console.log("icount=",icount,"  dcount=",dcount,"  allcount:",allcount);
        console.log("All thru")});
}


async function doTheEntry(entries) {
    const collections = await dBase.listCollections().toArray();    // read all collection names
    let inserted = 0;                                           // count number of inserted records
    let korr = dBase.collection('properties');
//    for (let i=0; i< entries.length; i++) {                     // loop through all entries
    for (let i=0; i< 500; i++) {                                // loop through all entries
        let cname = entries[i].sid + '_current';                // build collection name
        var coll = dBase.collection(cname);                     // use this collection
        if (!collections.map(c => c.name).includes(cname)) {    // does it already exist?
            console.log("New:",cname);                          // no -> show it it
            inserted = await korr.insertOne( entries[i].properties);  // and save properties
            await dBase.createCollection(cname)
            await coll.createIndex({ datetime:1}, { expireAfterSeconds: 2764800});  // expire after 32 days
        } else {                                      // collection exists
            let doc = await coll.findOne({datetime: entries[i].values[0].datetime});
            if(doc == null) {
                inserted = await
                coll.insertMany(entries[i].values);  // so save new values
                icount += inserted.insertedCount;
            } else {
                dcount+=entries[i].values.length;
            }
        }
    }
}

// Check lat/lon and convert to float
function checkLatLon(w) {
    if ((w == null) || (w == "")) {
        return 0.0;
    } else {
        return parseFloat(w);
    }
}


// Vorne 0 hinschreiben, wenn n < 10 ist
function nullfill(n) {
    return (n < 10) ? ('0' + n) : n;
}

// Umrechnen der msec in minuten und Sekunden und als String zurückgeben
function minsec(msec) {
    let min = Math.floor((msec/60000));
    msec -= min*60000;
    let sec = (msec/1000).toFixed(2);
    return nullfill(min) + ':' + nullfill(sec) + ' min:sec';
}


//

/*
//https://zeit.co/blog/async-and-await
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Usage!
sleep(500).then(() => {
    // Do something after the sleep!
});

def addAltitude(loc):
	""" fetch the altitude of location coordinates via Google-API """
	try:
		r = requests.get('https://maps.googleapis.com/maps/api/elevation/json?locations={0},{1}&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E'.format(loc[0],loc[1]))
		places = r.json()
		eletxt = 'At {0} elevation is: {1}'
		print (eletxt.format(loc, places['results'][0]['elevation']))
	except:
		print (('Error in altitude for location: {0}').format(loc))
		return 0
	return round(places['results'][0]['elevation'])
#Ende: def addAltitude(loc):



def addAddress(loc):
	""" Fetch address for location coordinates via Google-API """

	try:
		r = requests.get('https://maps.googleapis.com/maps/api/geocode/json?latlng={0},{1}&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E'.format(loc[0],loc[1]))
		addr = r.json()
#		print (addr)
	except:
		print(('Error in address for location: {0}').format(loc))
		return ""
	return addr['results'][0]['address_components']
#end: def addAddress(loc):


*/