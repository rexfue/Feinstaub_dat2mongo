/**
 * Einlesen der laufenden Daten vom luftdate.info-Server
 *
 * Die Daten werden alle 5min (wenns schnell genug ist) eingelesen und in der
 * Mongo-DB abgespeichert.
 *
 * Aufbau der verschiedenen Collections sie im doc-Verzeichnis
 *
 * Zusätzliche Funktionen:
 * - Überprüfung der Sensoren, die in der Textdateit 'mysids.txt' liegen. Falls einer
 *   länger als 1h nicht gesendet hat, eine mail absetzen
 * - 1x täglich die Sensoren (d.h. die Collections), die in der Datei 'newsids_s.txt
 *   aufgezählt sind, durchgehen und die zugehörige Adresse sowie die Höhe über NN von
 *   Google holen und abspeichern
 *
 *
 * <<<<<<<<<<<<<< TODO
    - 24h-gleitenden Mittelwert laufend mitrechnen
    - diesen immer um 0h00 (UTC !!!!) extra als Tagesmittewert abspeichern und in
      eine eigen collection eintragen
 **/

const LIVE=true;

const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const nodemailer = require('nodemailer');
const reuqest = require('request');

const ACTVE_CNT=12;                     // 12 * 5min => 1 h for activity check

let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
let MONGOAUTH = process.env.MONGOAUTH;
let MONGOUSRP = process.env.MONGOUSRP;

if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27017; }
if (MONGOAUTH === undefined) { MONGOAUTH =  'false'; }

let MONGO_URL = 'mongodb://'+MONGOHOST+':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database
if (MONGOAUTH == 'true') {
    MONGO_URL = 'mongodb://'+MONGOUSRP+'@' + MONGOHOST + ':' + MONGOPORT + '/Feinstaubi_A';          // URL to mongo database
}
const API_URL = 'https://api.luftdaten.info/static/v1/data.json';	// URL to API on 'luftdaten.info'
const API24_URL = 'https://api.luftdaten.info/static/v2/data.24h.json';	// URL to API on 'luftdaten.info'
const SAVE_NAME = 'data/aktdata.json';  // filename for actual data
const MY_SIDS = 'data/mysids.txt';      // file, where my SIDs are stored
const PROP_COLL='properties';
const MAP_COLL='mapdata';

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
const D1900 = moment.utc('1900-01-01').toDate();
const defaultAddress = {
    number: 'NA',
    city: 'S',
    region: 'BW',
    country: 'DE',
    plz: NaN,
    street: 'F'
};

// create reusable transporter object using the default SMTP transport
let transporter = nodemailer.createTransport({
    host: 'smtp.1und1.de',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'rxf@fuerst-stuttgart.de', // generated ethereal user
        pass: 'Jup!ter4'  // generated ethereal password
    }
});

console.log("\n\rStart: ", start.format("YYYY-MM-DD HH:mm"));

/*
let mysid =
    [
        { name: 'rxf', sid: 140, cnt:10 },
        { name: 'rxf', sid: 141, cnt:10 },
        { name: 'lothar', sid: 187, cnt:10 },
        { name: 'lothar', sid: 188, cnt:10 },
        { name: 'holger', sid: 789, cnt:10 },
        { name: 'holger', sid: 790, cnt:10 },
        { name: 'günter', sid: 1725, cnt:10 },
        { name: 'günter', sid: 1726, cnt:10 },
        { name: 'henny', sid: 2590, cnt:10 },
        { name: 'henny', sid: 2591, cnt:10 },
        { name: 'felix', sid: 7905, cnt:10 },
        { name: 'felix', sid: 7906, cnt:10 },
        { name: 'sternwarte', sid: 1999, cnt:10 },
        { name: 'sternwarte', sid: 2000, cnt:10 }
    ];
saveDatatoFile(MY_SIDS,JSON.stringify(mysid));
*/

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
        constructDBaseEntries(readDatafromFile(SAVE_NAME));
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
            saveDatatoFile(SAVE_NAME,JSON.stringify(jsBody));
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
                    saveDatatoFile(SAVE_NAME,JSON.stringify(jsBody));
                    end1 = moment();
                    console.log("2-Dauer save to Disk: ", end1 - start);
                    constructDBaseEntries(jsBody);
                } catch (err) {
                    console.log(err);
                    process.exit(-1);
                }
            });
        }
    });
}

// var obj = objArray.find(function (obj) { return obj.id === 3; });

// die Daten in eimnr Datei zwischenspeichern
function saveDatatoFile(fn,data) {
    fs.writeFileSync(fn,data);
}

// Daten wieder vom File lesen
function readDatafromFile(fn) {
    return JSON.parse(fs.readFileSync(fn));
}


function constructDBaseEntries(body) {
    console.log("Dauer bis Aufruf zum Parsen: ", moment() - start);
    let mySids = readDatafromFile(MY_SIDS);
    let allValues = [];
    let st1 = moment();
    try {
        for (let i = 0; i < body.length; i++) {                     // check all entries
            let entry = {};
            let val = [];
            let sid = body[i].sensor.id;
            let sname = body[i].sensor.sensor_type.name;
            let idx = allValues.findIndex(function (obj) {          // is sid alredy in array
                return obj.sid === sid;
            });
            if (idx != -1) {                                        // yes
                val = allValues[idx].values;                        // -> read current values
            } else {                                                // no
                allValues.push({'sid': sid, 'values': val});        // -> push  sid and empty values
                idx = allValues.length - 1;                         // adjust index
                markMySids(mySids, sid);                            // mark 'mysids' as OK
//            allValues[idx].properties = {};
//            allValues[idx].properties.othersensors = [];        // init array for the other sensors on same location
            }
            let date = moment.utc(body[i].timestamp);               // extract date of entry
            entry.datetime = date.toDate();					        // make datetime for Mongo (== ISODate)
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
                if (date.isSame(val[n].datetime)) {                 // if the same datetime is aready entered
                    delete entry.datetime;                          // delete it
                    for (var k in entry) {                          // and enter the typ and value
                        val[n][k] = entry[k];
                    }
                    x = false;                                      // clear flag
                    break;
                }
            }
            if (x == true) {                                        // if flag set (after loop)
                val.push(entry);                                    // push the entry, else it is already entered
            }

            allValues[idx].values = val;                            // now push all into the big array
            let properties = {
                _id: sid,
                name: sname,
                date_since: moment().toDate(),
                location: [{
                    loc: {
                        type: "Point",
                        coordinates: [checkLatLon(body[i].location.longitude), checkLatLon(body[i].location.latitude)]
                    },
                    id: body[i].location.id,
                    altitude: checkAltitude(body[i].location),
                    address: defaultAddress,
                    date_since: moment().toDate(),
                }],
                othersensors: [],
            };
//            console.log(properties.sid);
            allValues[idx].properties = properties;
            let fnd = allValues.findIndex(function (obj) {          // is current location-id in array?
                let idx = obj.properties.location.length - 1;       // use newest location entry
                return obj.properties.location[idx].id === body[i].location.id;
            });
            if ((fnd != -1) && (fnd != idx)) {                      // same location -> korrelate (skip own sid)
                if(!allValues[fnd].properties.othersensors.map(x => x.id).includes(sid)) {
//                if ((allValues[fnd].properties.othersensors).indexOf(body[i].sensor.id) == -1) {  // if not already stored
                    allValues[fnd].properties.othersensors.push(
                        {'id':sid, 'name':sname});  // enter sid and name
                }
                let fndsid = allValues[fnd].sid;
                if(!allValues[idx].properties.othersensors.map(x => x.id).includes(fndsid)) {
//                if ((allValues[idx].properties.othersensors).indexOf(fndsid) == -1) {  // if not already stored
                    allValues[idx].properties.othersensors.push({'id': fndsid, 'name': allValues[fnd].properties.name});  // enter sid and name
                }
            }
        }
    }
    catch(xerr) {
        console.log(xerr);
    }
    allcount = allValues.length;                                // so many elents were adde9d
/*
            if (!collections.map(c => c.name).includes(cname)) {    // does it already exist?
                console.log("New:", cname);                          // no -> show it it

 */
//	console.log(allValues);
	let los = moment();
	let maptim;
	console.log("Parsen dauert:", los-st1);

    // check, if 'mysensor' are still alive
    checkMySids(mySids);
    saveDatatoFile(MY_SIDS,JSON.stringify(mySids));

	doTheEntry(allValues)
        .then(() => {
                maptim = moment();
                return doMapEntry(allValues);
            })
        .then(() => {
//        let now = moment();

//        if (now.format('HH:mm') == LOCATION_TIME) {
//            await lc.locationcheck(dBase);
//        }
        let gz =  moment()-los;
        console.log("Map Schreiben: ",moment()-maptim);
        console.log("Schreiben in dBase: ",  gz ,'msec  ', minsec(gz));
        let gz1 = moment()-start;
        console.log("Gesamtzeit: ", gz1 ,'msec  ', minsec(gz1));
        console.log("icount=",icount,"  dcount=",dcount,"  allcount:",allcount);
        put2MQTT(gz,allcount);
        console.log("All thru!  Time needed: ",minsec(moment()-start) );
        dBase.close();
	});
}


async function doTheEntry(entries) {
    const collections = await dBase.listCollections().toArray();    // read all collection names
    let inserted = 0;                                           // count number of inserted records
    let korr = dBase.collection(PROP_COLL);
    console.log("Einträge gesamt:",entries.length);
    for (let i=0; i< entries.length; i++) {                     // loop through all entries
        let cursid = entries[i].sid;                            // extract current SID
        let cname = 'data_'+cursid;                             // build collection name
        var coll = dBase.collection(cname);                     // use this collection
//  	console.log(entries[i]);
        try {
            if (!collections.map(c => c.name).includes(cname)) {  // does it already exist in collections?
                console.log("New:", cname);                     // no -> show it it
                await dBase.createCollection(cname);            // create collection
                // and set TTL Index to 32 days
                await coll.createIndex({datetime: 1}, {expireAfterSeconds: 32832000});  // 380 Tage
            } else {                                            // collection exists
                try {
                    const doc = await korr.findOne({_id: cursid});      // does it exist in properties?
                    if (doc == null) {
                        await korr.insertOne(entries[i].properties);  // no, then save properties
                    }
                    inserted = await coll.insertMany(entries[i].values);  // save new values in collection
                    icount += inserted.insertedCount;
                }
                catch (e) {
                    if(e.message.startsWith("E11000 duplicate")) {
//                        console.log("Duplicate:",entries[i].sid);
                        dcount++;

                    } else {
                        console.log(e, cname);
                    }
                }
            }
        }
        catch(err) {
            console.log(err);
        }
    }
}


async function doMapEntry(entries) {
    let mapcoll = dBase.collection(MAP_COLL);
    try {
        await mapcoll.drop();  // remover collection
    }
    catch(e) {
    }
    await dBase.createCollection(MAP_COLL);
    await mapcoll.createIndex({location: "2dsphere"});      // and on Location

    for (x in entries) {                     // loop through all entries
        let one = entries[x];
        try {
            let toEnter = {};
            if(('P1' in one.values[0]) || ('P2' in one.values[0])) {
                toEnter.values = one.values[one.values.length - 1];
                toEnter._id = one.sid;
                toEnter.location = one.properties.location[one.properties.location.length - 1].loc;

                let inserted = await mapcoll.insertOne(toEnter);
//                console.log(inserted.insertedCount);
            }
        }
        catch(e) {
            console.log("doMapEntry: ", one.sid, e);
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

// Check, if altitude is ther. If so, use it, else use 0
function checkAltitude(loc) {
    if(loc.altitude == undefined) {
        return 0;
    } else {
        return parseFloat(loc.altitude);
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

// Check, if 'my' sensors are still alive:
// Compare dates in read-in file. If date is older than 1 hour, send out mail,
// then store aktual dates
// Data:
// [{ sid,cnt}, {sid, cnt}, {}, ... ]
function checkMySids(ms) {
    let body = "";
    for(let i=0; i<ms.length; i++) {
        if (--ms[i].cnt == 0) {
            body += "Sensor " + ms[i].sid + " von " + ms[i].name + " sendet seit einer Stunde nicht mehr\n"
        }
    }
    if (body != "") {
        console.log(body);

        // setup email data with unicode symbols
        let mailOptions = {
            from: '"Feinstaub" <rxf@fuerst-stuttgart.de>',            // sender address
            to: 'rexfue@gmail.com',                     // list of receivers
            subject: 'Feinstaubsensor(en) ausgefallen', // Subject line
            text: body // plain text body
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
        });
    }
}

// Mark sensor in array masids as aktive
function markMySids(mysids,sid) {
    let idx = mysids.findIndex(function (obj) {
        return obj.sid === sid;
    });
    if (idx != -1) {
        mysids[idx].cnt = ACTVE_CNT;
        console.log("found:", sid);
    }
}

// Put paramater to MQTT (Thingspeak)
function put2MQTT(data1,data2) {
	let KEY = process.env.TTS_KEY;
    let cmd = '&field1='+data1/1000;
    dBase.stats(function(err,erg) {
        cmd += '&field2='+parseInt(erg.objects) + '&field3='+parseInt(erg.storageSize) + '&field4='+parseInt(allcount);
        request.get('https://api.thingspeak.com/update?api_key='+KEY+cmd, function (err, resp, bod) {
            if(err) {
                console.log(err);
            } else {
                if(resp.statusCode == 200) {
                    console.log("TheThings meldet: ",bod);
                }
            }
        });
    });
}

