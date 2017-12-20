/** locationcheck.js            rxf     2017-12-11

    Check the file 'newsid' for new entries. For every entry find the address
    via goole maps API. Because of restrictions (max 2500 reuwsts/day), we look
    for max LOCATION_MAX (1000) addresses in one call.
    After adding the address to the dbase 'properties', we delete tis entry in the
    'newsid'-File.

 */

const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');

const LOCATION_MAX = 10;                          // so many entries will be checked

const APIKEY = "&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E";
const GOOGLE_ELEVATION='https://maps.googleapis.com/maps/api/elevation/json?locations=';
const GOOGLE_ADDRESS='https://maps.googleapis.com/maps/api/geocode/json?latlng=';


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST == undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT == undefined) { MONGOPORT =  27018; }
const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaub';  	// URL to mongo database

const FILE1 = 'data/newsids_s.txt';
const FILE2 = 'data/newsids_c.txt';

let start = moment();
console.log("\n\rStart: ", start.format("YYYY-MM-DD HH:mm"));


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);
    }
    locationcheck(db);
});


function locationcheck(db) {
    let collprop = db.collection('properties');
    doAddresses(db, collprop, FILE1, 1)
        .then(() => {
            console.log("Part 1 ready");
        }, (err) => {
            console.log("Part1 Error:",err);
        });
    db.close();
}

// fetch the addresses and store them into the dbase
async function doAddresses(db, coll, fn, which) {
    let i=0;
    try {
        let txt = fs.readFileSync(fn, "utf-8");
        let sid = JSON.parse(txt);
        if (sid.length > 0) {
            for (; i < sid.length; i++) {                         // loop over all entries in sid-file
                if (i == LOCATION_MAX) {                                // maxcount reached?
                    break;                                          // yes return
                }
                let sensID = parseInt(sid[i]);
                console.log('ID:', sensID);
                let doc = await coll.findOne({sid: sensID}, {'location.loc.coordinates': 1, _id: 0});        // read location
                if (doc == null) {
                    continue;
                }
                let latlng = [doc.location.loc.coordinates[1], doc.location.loc.coordinates[0]];
                let addr = await fetchAddress(latlng);                 // fetch address
                let altitude = await fetchAltitude(latlng);            // and altitude for thet location
                console.log('Adresse:',addr);
                console.log('Höhe:',altitude,'\n');
                coll.update(
                    {sid: sensID},
                    { $set: {'location.address': addr, 'location.altitude': altitude}},
                    function(err,updated) {
                        if(err) {
                            console.log("Err:",err);
                        }
                        console.log("UPD",updated);
                    }
                );
                console.log('Updated:', updated.result.n);
            }
        }
    }
    catch (e) {
    }
    return i;
}


// fetch altitude from Google
function fetchAltitude(koord) {
    const p = new Promise((resolve, reject) => {
        let altitude = 0;
    let rq = GOOGLE_ELEVATION + koord;
    request(rq + APIKEY, function (error, response, body) {
        let jsBody;
//            console.log('error:', error); // Print the error if one occurred
//            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        try {
            jsBody = JSON.parse(body);
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
    const p = new Promise((resolve, reject) =>
        {
            let toInsert = {};
    let rq = GOOGLE_ADDRESS + koord;
    request(rq + APIKEY, function (error, response, body) {
        let jsBody;
        //           console.log('error:', error); // Print the error if one occurred
        //           console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        try {
            jsBody = JSON.parse(body);
//            console.log(jsBody);
            if (jsBody == undefined) {
                reject("jsbody undef: ", rq);
            }
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
        } catch (err) {
            console.log(err,rq);
            reject(err)
        }
    });
});
    return p;
}








