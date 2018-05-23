// readFromcsv - Alte Daten vom Luftdaten per CSV einlesen
//
// Für jeden Sensor den 24h-Mittelwert bilden.
// Für den Feinstaub das Maximum und für die Klimawerte Maximum und Minimum
// Die Mittelwerte alle in eine Datenbank eintragen (db24avg)
// Collections: data_sid
// Documents:  P10avg, P10max, P25avg, P25max
//             tempavg, tempmax, tempmin,  hunmavg, hummax, hummin,  presavg, presmax, presmin
//
//  rxf  2018-05-20


const LIVE=true;

const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
let $ = jQuery = require('jquery');
require('./jquery.csv.js');


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/db24avg';  	// URL to mongo database
const API_URL = 'http://archive.luftdaten.info/';	            // URL to API on 'luftdaten.info'

let dBase = null;
let start = moment();
let end, end1;
let sidArray = [];
let insertCount = 0;
let dupCount=0;
let insertedSIDs=0;

let std = moment().startOf('day').subtract(1,'day');         // yeserday
let startDate = std.format("YYYY-MM-DD");                    // Date-String for yesterday
let numberOfDays = 1;

let connect = MongoClient.connect(MONGO_URL);


console.log("Start:",moment().format("YYYY-MM-DD HH:mm:ss"));
console.log(MONGO_URL);

// process the commandline arguments
if (process.argv[2] !== undefined)
    startDate = process.argv[2];
if (process.argv[3] !== undefined)
    numberOfDays = parseInt(process.argv[3]);

connect
    .then(db => {
        return readSensorsperDay(db)
    })
    .then(() => {
        console.log("\nInserted:",insertCount, 'Doppelte:',dupCount);
        console.log("Ende:", moment().format("YYYY-MM-DD HH:mm:ss"));
    })
    .catch(err => {
        console.log(err);
        process.exit(-1);
    });

// do the whole work
async function readSensorsperDay(db) {
    let st = moment(startDate);                                 // startdate
    let end = moment(startDate);
    end.add(numberOfDays, 'day');                               // enddate
    for (let d = st; d < end; d.add(1, 'day')) {                // loop thru days
        insertCount = 0;
        console.log('\n***************', d.format('YYYY-MM-DD\n')); // log every day
        let mist = false;
        // fetch sensors list of current day
        let list = await getdirlistOfOneDay(d.format('YYYY-MM-DD')).catch( error => { console.log(error); mist = true;});
        if (mist) continue;                                     // if day doesn't exist, continue
        await enterSensors(db,list, d.format('YYYY-MM-DD'));       // fetch and enter sensor data
    }
    db.close();
}


// get list of all saved sensors for this day
function getdirlistOfOneDay(day) {
    const p = new Promise((resolve, reject) => {
        request(API_URL + day, function(error, response, body) {    // fetch the list
//            console.log(response.statusCode);
            if ((response.statusCode != 200 ) || (error)) {     // if not OK
                console.log(error);                             // log error
                reject(error);                                  // and return the rror
            }
            let a = body.split('"');                            // parse the list
            let list = [];
            for (let i = 0; i < a.length; i++) {
                if (a[i].startsWith(day.substr(0, 4))) {        // extract the sensor names
                    list.push(a[i]);
                }
            }
            resolve(list);                                      // and return th elist
        });
    });
    return p;
}


// Iterate thru the list and enter every sensor data into db
async function enterSensors(db,list,dt) {
//    for (let i=0; i< list.length; i++) {                        // iterate the list
    for (let i=0; i< list.length; i++) {                            // iterate the list
        let icount = await putOneSensorInDb(db,list[i],dt);         // put one sensor data inti DB
        if ((i % 50) == 0) {                                       // write dots to ...
            process.stdout.write('.');                             // show activity
        }
        insertCount += icount;                                  // add nbr of inserts
    }
}


// read CSV file and enter data
async function putOneSensorInDb(db,name,dt) {
    let erg = await readOneSensorOneDay(name, dt)
//    return await enterOneSensorinDB(db,name, dt,erg);
    return 0;
}


// read the CSV-File and parse it int right format for DB
function readOneSensorOneDay(name, dt) {
    const p = new Promise((resolve, reject) => {
        let url = API_URL + dt + '/' + name;                    // construct URL
        let sid = name.split("_")[3].replace('.csv', '');
        request(url, function (error, response, body) {         // request the file
            if((error) || (response.statusCode != 200)) {
                console.log("error readOneSensorOneDay:", error);
                reject("Error", error);                         // if not OK, reject
            }
            $.csv.toObjects(body, {separator: ';'}, function (err, data) {  // parse CSV
//                console.log("Lang: ", data.length);
                let entry = {};
                entry.date = moment(dt).toDate();
                entry.p1avg=0; entry.p1max=0; entry.p1cnt=0;
                entry.p2avg=0; entry.p2max=0; entry.p2cnt=0;
                entry.teavg=0; entry.temax=0; entry.temin=9999; entry.tecnt=0;
                entry.huavg=0; entry.humax=0; entry.humin=9999; entry.hucnt=0;
                entry.pravg=0; entry.prmax=0; entry.prmin=9999; entry.prcnt=0;
                for (var i = 0; i < data.length; i++) {
                    if (data[i].P1 !== undefined) {
                        let x = parseFloat(data[i].P1);
                        entry.p1avg += x;
                        entry.p1cnt++;
                        if(entry.p1max < x) { entry.p1max = x;}
                    }
                    if (data[i].P2 !== undefined) {
                        let x = parseFloat(data[i].P2);
                        entry.p2avg += x;
                        entry.p2cnt++;
                        if(entry.p2max < x) { entry.p2max = x;}
                    }
                    if (data[i].temperature !== undefined) {
                        let x = parseFloat(data[i].temperature);
                        entry.teavg += x;
                        entry.tecnt++;
                        if(entry.temax < x) { entry.temax = x;}
                        if(entry.temin > x) { entry.temin = x;}
                    }
                    if (data[i].humidity !== undefined) {
                        let x = parseFloat(data[i].humidity);
                        entry.huavg += x;
                        entry.hucnt++;
                        if(entry.humax < x) { entry.humax = x;}
                        if(entry.humin > x) { entry.humin = x;}
                    }
                    if (data[i].pressure !== undefined) {
                        let x = parseFloat(data[i].pressure);
                        entry.pravg += x;
                        entry.prcnt++;
                        if(entry.prmax < x) { entry.prmax = x;}
                        if(entry.prmin > x) { entry.prmin = x;}
                    }
                }
                entry.p1avg = entry.p1avg / entry.p1cnt;
                entry.p2avg = entry.p2avg / entry.p2cnt;
                entry.teavg = entry.teavg / entry.tecnt;
                entry.huavg = entry.huavg / entry.hucnt;
                entry.pravg = entry.pravg / entry.prcnt;
                resolve({ all:entry, sid:sid });                  // return all the data
            });
        });
    });
    return p;
}



// enter all data for one sensor into DB
async function enterOneSensorinDB(db,name,dt,erg) {
    let sid = erg.sid;
    let all = erg.all;
    let inserted = {insertedCount: 0};
    try {
        let collName = 'data_' + sid;                           // build collection name
        let coll = db.collection(collName);
        let ret = await coll.findOne();                         // does it exist?
        if(ret == null) {
            console.log('New Sensor:', sid);                    // no
            await db.createCollection(collName);             // create collectiom
            await coll.createIndex({datetime: 1}, {expireAfterSeconds: 2764800}, {unique: true});  // expire after 32 days
            inserted = await coll.insertMany(all)           // then insert values
            return(inserted.insertedCount);
        } else {
            let std = moment.utc(dt).startOf('day');
            let endd = moment.utc(dt).startOf('day').add(1,'day');
            let docs = await coll.find({datetime: {$gte: new Date(std), $lt: new Date(endd)}}, {sort: {datetime: 1}}).toArray();
            for (let i = docs.length - 1; i >= 0; i--) {
                let dt = docs[i].datetime.valueOf();
                for (let a = all.length - 1; a >= 0; a--) {
                    let at = all[a].datetime.valueOf();
                    if (dt == at) {
                        all.splice(a, 1);
                        break;
                    }
                }
            }
            if (all.length > 0) {
                for (let i in all) {
                    try {
                        inserted = await coll.insertOne(all[i])
                    }
                    catch(e) {
                        if(e.message.startsWith("E11000 duplicate")) {
                            console.log("Duplicate:",sid);
                            dupCount++;
                            continue;
                        } else {
                            console.log(e, sid);
                        }
                    }
                }
            }
        }
    }
    catch(e) {
        if(e.message.startsWith("E11000 duplicate")) {
            console.log("Duplicate:",sid);
            dupCount++;
            return 0
        } else {
            console.log(e, sid);
        }
    }
    return(inserted.insertedCount);
}


// Vorne 0 hinschreiben, wenn n < 10 ist
function nullfill(n) {
    return (n < 10) ? ('0' + n) : ''+n;
}

// Umrechnen der msec in minuten und Sekunden und als String zurückgeben
function minsec(msec) {
    let min = Math.floor((msec/60000));
    msec -= min*60000;
    let sec = (msec/1000).toFixed(2);
    return nullfill(min) + ':' + nullfill(sec) + ' min:sec';
}


