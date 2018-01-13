/** locationcheck.js            rxf     2017-12-11

    Check the collection 'propertiesn' for location and othersensor entries.
    Compare with the file 'currentdata.txt', which will be stored once a day
    direktly from tha luftdaten data.
    Enter all missing data into the collection
 */

const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');

// Goole-API-Definitions
const APIKEY = "&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E";
const GOOGLE_ELEVATION='https://maps.googleapis.com/maps/api/elevation/json?locations=';
const GOOGLE_ADDRESS='https://maps.googleapis.com/maps/api/geocode/json?latlng=';


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST == undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT == undefined) { MONGOPORT =  27017; }
const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database
const PROP_COLL = 'properties'

const FILE1 = 'data/aktdata.json';
const connect = MongoClient.connect(MONGO_URL);

// fix date 'date_since'
const D1900 = moment.utc('1900-01-01').toDate();
const defaultAddress = {
    number: 'NA',
    city: 'S',
    region: 'BW',
    country: 'DE',
    plz: NaN,
    street: 'F'
}



console.log("\n\rStart: ", moment().format("YYYY-MM-DD HH:mm:ss"));

connect
    .then(db => {
        return doTheCheck(db);
    })
    .catch(err => {
        console.log(err);
        process.exit(-1);
    });



async function doTheCheck(db) {
    let fdata = await readDatafile(FILE1);
    await checkAll(db, fdata);
    db.close();
    console.log("Ende:", moment().format("YYYY-MM-DD HH:mm:ss"));
}

function readDatafile(fn) {
    const p = new Promise((resolve,reject) => {
        try {
            let inp = fs.readFileSync(fn);
            let erg = JSON.parse(inp);
            resolve(erg);
        }
        catch (e) {
            reject(e);
        }
    });
    return p;
}

function constructDBaseEntries(body) {
    let allValues = [];
    try {
        for (let i = 0, j=0; i < body.length; i++) {                     // check all entries
            let sid = body[i].sensor.id;
            let sname = body[i].sensor.sensor_type.name;
            let idx = allValues.findIndex(function (obj) {          // is sid alredy in array
                return obj.sid === sid;
            });
            if (idx != -1) {                                        // yes
                continue;                                           // -> skip to next
            } else {                                                // no
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
                        altitude: 0,
                        address: defaultAddress,
                        date_since: moment().toDate(),
                    }],
                    othersensors: [],
                }
                allValues[j] = properties;
                let fnd = allValues.findIndex(function (obj) {          // is current location-id in array?
                    let idx = obj.location.length - 1;       // use newest location entry
                    return obj.location[idx].id === body[i].location.id;
                });
                if ((fnd != -1) && (fnd != j)) {                      // same location -> korrelate (skip own sid)
                    if ((allValues[fnd].othersensors).indexOf(body[i].sensor.id) == -1) {  // if not already stored
                        allValues[fnd].othersensors.push(sid);           // enter sid
                    }
                    let fndsid = allValues[fnd].sid;
                    if ((allValues[j].othersensors).indexOf(fndsid) == -1) {  // if not already stored
                        allValues[j].othersensors.push(fndsid);                 // enter sid
                    }
                }
                j++;
            }
        }
    }
    catch (xerr) {
        console.log(xerr);
    }
    return allValues;
}



// Check lat/lon and convert to float
function checkLatLon(w) {
    if ((w == null) || (w == "")) {
        return 0.0;
    } else {
        return parseFloat(w);
    }
}




async function checkAll(db,data) {
    let allprops = constructDBaseEntries(data);                     // construct all entries from the actual datafile
    for (let x in allprops) {                                       // loop thru every entry
        try {
            let prop = allprops[x];                                 // get one entry
//            console.log(prop._id);
            let coll = db.collection(PROP_COLL);
            let entry = await coll.findOne({_id: prop._id});        // fetch data from dbase for this sensor
            if (entry == null) {                                    // sensor isn't in DB
                console.log("New entry: ", prop._id);
                let latlng = [prop.location[0].loc.coordinates[1], prop.location[0].loc.coordinates[0]];
                prop.location[0].address = await fetchAddress(latlng);      // fetch address
                prop.location[0].altitude = await fetchAltitude(latlng);    // and altitude for thet location
                console.log(prop.location[0].address);
                let inserted = await coll.insertOne(prop);
            } else {
                let nbr = entry.location.length - 1;
                let doUpdate = false;
                if (entry.location[nbr].address.number == 'NA') {
                    let latlng = [prop.location[0].loc.coordinates[1], prop.location[0].loc.coordinates[0]];
                    let addr = await fetchAddress(latlng);                 // fetch address
                    if(addr.number != 'NA') {
                        let altitude = await fetchAltitude(latlng);            // and altitude for thet location
                        entry.location[nbr].address = addr;
                        entry.location[nbr].altitude = altitude;
                        doUpdate = true;
                        console.log(prop._id,entry.location[nbr].address);
                    }
                }
                if (doUpdate) {
                    let ln = {};
                    ln['location.' + nbr] = entry.location[nbr];
                    let updated = await coll.updateOne({_id: prop._id}, {$set: ln});
                    console.log('Updated_Address:', prop._id, updated.result.n);
                }
                if (prop.othersensors.length != entry.othersensors.length) {
                    let updated = await coll.updateOne({_id: prop._id}, {$set: {othersensors: prop.othersensors}});
                    console.log('Updated_Other:', prop._id, updated.result.n);
                } else {
                    for (let x in prop.othersensors) {
                        let onb = prop.othersensors[x];
                        if (entry.othersensors.indexOf(onb) == -1) {
                            let updated = await coll.updateOne({_id: prop._id}, {$push: {othersensors: onb}});
                            console.log('Updated_Push_Other:', prop._id, updated.result.n);
                        }
                    }
                }
            }
        }
        catch(err) {
            console.log(err);
        }
    }
}


// fetch altitude from Google
function fetchAltitude(koord) {
    const p = new Promise((resolve, reject) => {
        let altitude = 0;
    let rq = GOOGLE_ELEVATION + koord;
    request(rq + APIKEY, function (error, response, body) {
//            console.log('error:', error); // Print the error if one occurred
//            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        try {
            let jsBody = JSON.parse(body);
//                console.log('result:', jsBody.results);
//                console.log("Altitude ist", jsBody.results[0].elevation);
            altitude = jsBody.results[0].elevation;
            resolve(Math.floor(altitude));
        } catch (err) {
            console.log(err,rq);
            reject(err);
        }
    });
});
    return p;
}


// fetch Address from Google
function fetchAddress(koord) {
    const p = new Promise((resolve, reject) => {
        let toInsert = {};
        let rq = GOOGLE_ADDRESS + koord;
        try {
        request(rq + APIKEY, function (error, response, body) {
            console.log('error:', error); // Print the error if one occurred
            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
            let jsBody = JSON.parse(body);
            //            console.log(jsBody);
            if (jsBody == undefined) {
                console.log('fetchAddress: jsBody undefined', rq);
                reject("jsbody undef: ", rq);
            }
            if (jsBody.status == "OVER_QUERY_LIMIT") {
                console.log('Google meldet: "OVER_QUERY_LIMIT"  ****> ABBRUCH');
                process.exit(-1);
            }
            if (jsBody.status == "ZERO_RESULTS") {
                toInsert.number = 'NA';
                resolve(toInsert);
            }
//                console.log("Result:", jsBody.results[0]);
            if (jsBody.status == 'OK') {
                let addr = jsBody.results[0].address_components;
                if (addr != "") {
                    for (let i = 0; i < addr.length; i++) {
                        if (addr[i].types[0] == 'street_number') {
                            toInsert.number = addr[i].short_name;
                        }
                        if (addr[i].types[0] == 'route') {
                            toInsert.street = addr[i].short_name;
                        }
                        if (addr[i].types[0] == 'locality') {
                            toInsert.city = addr[i].long_name;
                        }
                        if (addr[i].types[0] == 'country') {
                            toInsert.country = addr[i].short_name;
                        }
                        if (addr[i].types[0] == 'political') {
                            toInsert.region = addr[i].short_name;
                        }
                        if (addr[i].types[0] == 'postal_code') {
                            toInsert.plz = Math.floor(addr[i].short_name);
                        }
                    }
                    resolve(toInsert);
                }
            }
        });
        } catch (err) {
                console.log(err, rq);
                reject(err)
            }
        });
    return p;
}








