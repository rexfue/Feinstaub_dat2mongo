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

const ACTVE_CNT=12;                     // 12 * 5min => 1 h for activity check


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
let MONGOAUTH = process.env.MONGOAUTH;
let MONGOUSRP = process.env.MONGOUSRP;
let MONGOBASE =  process.env.MONGOBASE;

if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27017; }
if (MONGOAUTH === undefined) { MONGOAUTH =  'false'; }
if (MONGOBASE === undefined) { MONGOBASE =  'Feinstaubi_A'; }

let MONGO_URL = 'mongodb://'+MONGOHOST+':'+MONGOPORT;  	// URL to mongo database
if (MONGOAUTH == 'true') {
    MONGO_URL = 'mongodb://'+MONGOUSRP+'@' + MONGOHOST + ':' + MONGOPORT + '/?authSource=admin';          // URL to mongo database
}
const API_URL = 'https://api.luftdaten.info/static/v1/data.json';	// URL to API on 'luftdaten.info'
const API24_URL = 'https://api.luftdaten.info/static/v2/data.24h.json';	// URL to API on 'luftdaten.info'
const SAVE_NAME = 'data/aktdata.json';  // filename for actual data
const MY_SIDS = 'data/mysids.json';      // file, where my SIDs are stored
const PROP_COLL='properties';
const MAP_COLL='mapdata';

let dBase = null;
let start = moment().local();
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


console.log("\n\rStart: ", start.format("YYYY-MM-DD HH:mm"));

// Check, if another instance is still running
// if after 3 attempts the checkfile is stilll there, run anyway !!
let checkFile = "data/checkfile";
let data = {};
if (fs.existsSync(checkFile)) {
    data = readDatafromFile(checkFile);
    if (data.count < 2) {
        data.count++;
        saveDatatoFile(checkFile, JSON.stringify(data));
        console.log("Exiting.. -  checkfile:",data.count);
        process.exit(0);
    }
}
data.count = 0;
saveDatatoFile(checkFile, JSON.stringify(data));
console.log("Starting.. - checkfile:",data.count);

// create reusable transporter object using the default SMTP transport
let transporter = nodemailer.createTransport({
    host: 'smtp.1und1.de',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'rxf@fuerst-stuttgart.de', // generated ethereal user
        pass: 'tibTop-xopqar-1qyrqe'  // generated ethereal password
    }
});


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

MongoClient.connect(MONGO_URL, { useNewUrlParser: true , useUnifiedTopology: true },function(err,client) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    dBase = client.db(MONGOBASE);
    console.log("Mongo connected. Starting program");
    startProgram(client);
});



function startProgram(client) {
    if (LIVE == true) {
        doReadfromAPI(client);
    } else {
        constructDBaseEntries(client,readDatafromFile(SAVE_NAME));
    }
}

function doReadfromAPI(client) {
    console.log("Start Reading from API");
    try {
        console.log("Try - 1");
        request(API_URL, {timeout: 5000}, function (error, response, body) {
            let jsBody;
            console.log('error:', error); // Print the error if one occurred
            console.log('statusCode at first try:', response && response.statusCode); // Print the response status code if a response was received
            end = moment();
            try {
                console.log("Try - 2");
                console.log("Try to parse - first run");
                jsBody = JSON.parse(body);
                console.log("1-Dauer read from net: ", end - start);
                saveDatatoFile(SAVE_NAME, JSON.stringify(jsBody));
                end1 = moment();
                console.log("1-Dauer save to Disk: ", end1 - start);
                constructDBaseEntries(client, jsBody);
            } catch (err) {
                console.log("Catch - 2");
                request(API_URL, {timeout: 5000}, function (error, response, body) {
                    console.log('error:', error); // Print the error if one occurred
                    console.log('statusCode at second try:', response && response.statusCode); // Print the response status code if a response was received
                    try {
                        console.log("Try - 3");
                        console.log("Try to parse - second run");
                        jsBody = JSON.parse(body);
                        console.log("2-Dauer read from net: ", end - start);
                        saveDatatoFile(SAVE_NAME, JSON.stringify(jsBody));
                        end1 = moment();
                        console.log("2-Dauer save to Disk: ", end1 - start);
                        constructDBaseEntries(client, jsBody);
                    } catch (err) {
                        console.log("Catch - 3");
                        console.log(err);
                        console.log("Exit at", moment().format());
                        process.exit(-1);
                    }
                });
            }
        });
    }
    catch(err) {
        console.log("Catch - 1");
        console.log(err);
        console.log("Exit at", moment().format());
        process.exit(-1);
    }
}

// die Daten in eimnr Datei zwischenspeichern
function saveDatatoFile(fn,data) {
    fs.writeFileSync(fn,data);
}

// Daten wieder vom File lesen
function readDatafromFile(fn) {
    return JSON.parse(fs.readFileSync(fn));
}


async function constructDBaseEntries(client,body) {
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
            let idx = allValues.findIndex(function (obj) {   // is sid already in array
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
            // if Noise-Senseo, add exp values to LAeq
            if(sname == 'Laerm') {
                entry.E10tel_eq = Math.pow(10,entry.noise_LAeq/10);
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
                    exact_loc: body[i].location.exact_location,
                    indoor: body[i].location.indoor,
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

	await doTheEntry(allValues);
    let gz =  moment()-los;
//  console.log("Map Schreiben: ",moment()-maptim);
    console.log("Schreiben in dBase: ",  gz ,'msec  ', minsec(gz));
    let gz1 = moment()-start;
    console.log("Gesamtzeit: ", gz1 ,'msec  ', minsec(gz1));
    console.log("icount=",icount,"  dcount=",dcount,"  allcount:",allcount);
    await storeStatistics(gz,allcount);
    put2MQTT(gz, allcount);
    console.log("All thru!  Time needed: ", minsec(moment() - start));
    console.log(moment());
    client.close();
    fs.unlinkSync(checkFile);
}


async function doTheEntry(entries) {
    let collections;
    let mapcoll = dBase.collection(MAP_COLL);
    let inserted = 0;                                           // count number of inserted records
    let korr = dBase.collection(PROP_COLL);
    try {
        collections = await dBase.listCollections().toArray();    // read all collection names
    }
    catch(err) {
        console.log(err);
    }
//    let has = await dBase.listCollections({name:'datat_140'}).hasNext();
//    console.log("Coll:",has);
    console.log("Einträge gesamt:",entries.length);
    for (let i=0; i< entries.length; i++) {                     // loop through all entries
        let item = entries[i];
        let cname = 'data_'+item.sid;                             // build collection name
        var coll = dBase.collection(cname);                     // use this collection
//  	console.log(item);
        try {
            if (!collections.map(c => c.name).includes(cname)) {  // does it already exist in collections?
                console.log("New:", cname);                     // no -> show it it
                try {
                    await dBase.createCollection(cname);        // create collection
                    // and set TTL Index to Environment TTL_INDEX or, if undefined, to 380 days
                    let ttl_index = (process.env.TTL_INDEX != undefined) ?  parseInt(process.env.TTL_INDEX) : 32832000;
                    await coll.createIndex({datetime: 1}, {expireAfterSeconds: ttl_index});
                } catch(err) {
                    console.log(err);
                }
            } else {                                            // collection exists
                try {
                    const doc = await korr.findOne({_id: item.sid});   // does it exist in properties?
                    if (doc == null) {
                        await korr.insertOne(item.properties);  // no, then save properties
                    } else {                                    // prop exists
                        if(doc.name != item.properties.name) {  // if we hav a new sensor name
                            console.log("Sensor geändert:",doc.name,item.sid,"=>",item.properties.name);
                            await korr.updateOne({_id:item.sid},{$set: {name:item.properties.name}});  // update properties
// KEINE AHNUNG WAS DAS SOLLTE
//                             let other = doc.othersensors;       // get 'othersensor'
//                             if (other[0].id != undefined) {
//                                 let oid = other[0].id;
//                                 console.log("Other = ",oid);
//                             } else {
//                                 console.log("Other = undefined");
//                             }
                        }
                    }
                    inserted = await coll.insertMany(item.values);  // save new values in collection
                    icount += inserted.insertedCount;
                    let anz = item.values.length;
                    let ts = item.values[anz-1].datetime;
                    await korr.updateOne({_id:item.sid},{$set:{last_seen:ts}},{ upsert:true});

                    let toEnter = {};
                    toEnter.values = item.values[anz-1];
                    toEnter._id = item.sid;
                    toEnter.name = item.properties.name;
                    toEnter.location = item.properties.location[0].loc;
                    let updated = await mapcoll.updateOne({_id:item.sid},{$set: toEnter},{upsert:true});
//                    console.log(updated);
                }
                catch (e) {
                    if(e.message.startsWith("E11000 duplicate")) {
//                        console.log("Duplicate:",item.sid);
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
    // try {
    //     await mapcoll.drop();  // remover collection
    // }
    // catch(e) {
    // }
    // await dBase.createCollection(MAP_COLL);
    // await mapcoll.createIndex({location: "2dsphere"});      // and on Location

    for (x in entries) {                     // loop through all entries
        let one = entries[x];
        try {
            let toEnter = {};
//            if(('P1' in one.values[0]) || ('P2' in one.values[0]) || one.properties.name.startsWith("Radia") ) {
                toEnter.values = one.values[one.values.length - 1];
                toEnter._id = one.sid;
                toEnter.location = one.properties.location[one.properties.location.length - 1].loc;
                toEnter.name = one.properties.name;
                let inserted = await mapcoll.updateOne({_id:one.sid},{$set: toEnter}, {upsert:true});
//           console.log(inserted.insertedCount);
//            }
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

// Check, if altitude is there. If so, use it, else use 0
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
    let toAddr = 'rexfue@gmail.com';
    for(let i=0; i<ms.length; i++) {
        if (--ms[i].cnt == 0) {
            body += "Sensor " + ms[i].sid + " von " + ms[i].name + " sendet seit einer Stunde nicht mehr\n";
            if(ms[i].name == 'felix') {
                toAddr += ',felix.fuerst@gmail.com';
            }
        }
    }
    if (body != "") {
        console.log(body);

        // setup email data with unicode symbols
        let mailOptions = {
            from: '"Feinstaub" <rxf@fuerst-stuttgart.de>',            // sender address
            to: toAddr,                                                // list of receivers
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

// Store statistics for database into database
async function storeStatistics(data1,data2) {
    try {
        let stats = await dBase.stats(1024);
        let entry = {statistics: stats, time2write: data1, nbrofentries: data2};
        let collection_statistic = dBase.collection("statistic");
        await collection_statistic.insertOne(entry);
    }
    catch(e) {
        console.log("storestatistic:",e);
    }
}


// Put paramater to MQTT (Thingspeak)
function put2MQTT(data1,data2) {
	let KEY = process.env.TTS_KEY;
	if (KEY === undefined) {
	    return;
    }
    let cmd = '&field1='+data1/1000;
    try {
        dBase.stats(function (err, erg) {
            cmd += '&field2=' + parseInt(erg.objects) + '&field3=' + parseInt(erg.storageSize) + '&field4=' + parseInt(allcount);
            request.get('https://api.thingspeak.com/update?api_key=' + KEY + cmd, {timeout: 5000}, function (err, resp, bod) {
                if (err) {
                    console.log(err);
                } else {
                    if (resp.statusCode == 200) {
                        console.log("TheThings meldet: ", bod);
                    }
                }
            });
        });
    }
    catch(e) {
        console.log("put2MQTT-Error:" , e);
    }
}

