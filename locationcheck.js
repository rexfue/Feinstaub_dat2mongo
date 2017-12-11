/** locationcheck.js            rxf     2017-12-11

    Check the file 'newsid' for new entries. For every entry find the address
    via goole maps API. Because of restrictions (max 2500 reuwsts/day), we look
    for max LOCATION_MAX (2000) addresses in one call.
    After adding the address to the dbane 'properties', we delete tis entry in the
    'newsid'-File.

 */

const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');

const LOCATION_MAX = 2000;                          // so many entries will be checked

const APIKEY = "&key=AIzaSyBpQm2BKLtU2oxdrgy45s27ao3J1cBj64E";
const GOOGLE_ELEVATION='https://maps.googleapis.com/maps/api/elevation/json?locations=';
const GOOGLE_ADDRESS='https://maps.googleapis.com/maps/api/geocode/json?latlng=';

function locationcheck(db) {
    let txx = fs.readFileSync("./newsid.txt","utf-8");
    let sid = txt.split('\n');
    if (sid.length > 0) {
        doAdresses(sid).then((rest) => {
            fs.writeFile('./newsid.txt', JSON.stringify(rest);
        }
    }
}

// fetch the addresses an store them into the dbase
async function doAddresses(sid) {
    let maxCnt = LOCATION_MAX;                                  // set counter for max batch size
    for ( let i=0; i<sid.length; i++) {                         // loop over all entries in sid-file
        if (maxCnt-- = 0) {                                     // maxcount reached?
            return;                                             // yes return
        }
        let coll = db.collection[properties];                   // use this collection
        let latlong = coll.findOne({sid:sid[i]},{'location.longitude':1, 'locatiuon.latitude':1, id:0}); // read location
        let addr = await await fetchAddress(latlong);           // fetch address
        let altitude = await fetchAltitude(latlong);            // and altitude for thet location
        altitude = Math.floor(altitude);                        // convert altitude to integer
    }
}


// fetch altitude from Google
function fetchAltitude(koord) {
    return 234.567;
}
/*
    const p = new Promise((resolve, reject) => {
        let altitude = 0;
    let rq = GOOGLE_ELEVATION + koord.latitude + ',' + koord.longitude;
    request(rq + APIKEY, function (error, response, body) {
        let jsBody;
//            console.log('error:', error); // Print the error if one occurred
//            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        try {
            jsBody = JSON.parse(body);
//                console.log('result:', jsBody.results);
//                console.log("Altitude ist", jsBody.results[0].elevation);
            altitude = jsBody.results[0].elevation;
            resolve(altitude);
        } catch (err) {
            console.log(err,rq)
            reject(err);
        }
    });
});
    return p;
}
*/

// fetch Address from Google
function fetchAddress(koord) {
    return ({'city': 'Stuttgart'});
}

/*
    const p = new Promise((resolve, reject) =>
        {
            let toInsert = {};
    let rq = GOOGLE_ADDRESS + koord.latitude + ',' + koord.longitude;
    request(rq + APIKEY, function (error, response, body) {
        let jsBody;
        //           console.log('error:', error); // Print the error if one occurred
        //           console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        try {
            jsBody = JSON.parse(body);
            console.log(jsBody);
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
*/

module.exports = locationcheck;








