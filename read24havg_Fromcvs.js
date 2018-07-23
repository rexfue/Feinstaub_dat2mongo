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
const mathe = require('mathjs');
const fs = require('fs');
let $ = jQuery = require('jquery');
require('./jquery.csv.js');


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://rxf:5C5dB|m@' + MONGOHOST +':'+MONGOPORT+'/db24avg';  	// URL to mongo database
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

let readone_T = [];
let enterDB_T = [];
let gesamt_T = moment();

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
        console.log("Von "+startDate+ " bis " + moment(startDate).add(numberOfDays,'day') );
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
        let st_T = moment();
        let mist = false;
        // fetch sensors list of current day
        let list = await getdirlistOfOneDay(d.format('YYYY-MM-DD')).catch( error => { console.log(error); mist = true;});
        if (mist) continue;                                     // if day doesn't exist, continue
        await enterSensors(db,list, d.format('YYYY-MM-DD'));       // fetch and enter sensor data
        console.log("\nInserted:",insertCount, 'Doppelte:',dupCount, 'Datum:',d.format('YYYY-MM-DD\n'));
        console.log("Durchschnitt Lesen   eines Sensors:", mathe.mean(readone_T));
        console.log("Durchschnitt Eintrag eines Sensors:", mathe.mean(enterDB_T));
        let tegs = moment()-st_T;
        console.log("Gesamtzeit:", moment.duration(tegs).asMinutes(),'min');
    }
    db.close();
}


// get list of all saved sensors for this day
function getdirlistOfOneDay(day) {
    const p = new Promise((resolve, reject) => {
        request(API_URL + day, function(error, response, body) {    // fetch the list
//            console.log(response.statusCode);
            if ((response.statusCode != 200 ) || (error) || (body == "")) {     // if not OK
                console.log(error);                             // log error
                return reject(error);                                  // and return the rror
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
        if (icount != undefined) {
            insertCount += icount;                                  // add nbr of inserts
        }
//        console.log(insertCount);
    }
}


// read CSV file and enter data
async function putOneSensorInDb(db,name,dt) {
    let erg;
    let s1 = moment();
    try {
        erg = await readOneSensorOneDay(name, dt);
        readone_T.push(moment()-s1);
        return await enterOneSensorinDB(db, name, dt, erg);
//        return 0;
    }
    catch(err) {
        console.log("Error in putOneSensorInDB()");
    }
}

function findMinMaxAvg(arr,typ) {
    let min = parseFloat(arr[0][typ]),
        max = parseFloat(arr[0][typ]),
        sum = parseFloat(arr[0][typ]),
        cnt = 0;

    for (let i = 1, len=arr.length; i < len; i++) {
        let v = parseFloat(arr[i][typ]);
        sum += v; cnt++;
        min = (v < min) ? v : min;
        max = (v > max) ? v : max;
    }
    let avg = 0;
    if (cnt != 0) { avg = sum/cnt; }
    return [min, max, avg, cnt];
}

// read the CSV-File and parse it into right format for DB
function readOneSensorOneDay(name, dt) {
    const p = new Promise((resolve, reject) => {
        let url = API_URL + dt + '/' + name;                    // construct URL
        let sid = name.split("_")[3].replace('.csv', '');
        request(url, function (error, response, body) {         // request the file
            if((error) || (response.statusCode != 200) || (body == "")) {
                console.log("\nerror:",error, " readOneSensorOneDay at url:", url);
                return reject("Error", error);                         // if not OK, reject
            }
            $.csv.toObjects(body, {separator: ';'}, function (err, data) {  // parse CSV
//                console.log("Lang: ", data.length);
                if(data.length == 0) {
                    console.log("\nNo data vor url:",url);
                    return reject("Error", "No Data");
                }
                let entry = {};
                let arr = [];
                entry.date = moment(dt).toDate();
                if (data[0].P1 != undefined) {
                    arr = findMinMaxAvg(data,'P1');
                    entry.p1min = arr[0];
                    entry.p1max = arr[1];
                    entry.p1avg=  arr[2];
                    entry.p1cnt = arr[3];
                }
                if (data[0].P2 != undefined) {
                    arr = findMinMaxAvg(data,'P2');
                    entry.p2min = arr[0];
                    entry.p2max = arr[1];
                    entry.p2avg=  arr[2];
                    entry.p2cnt = arr[3];
                }
                if (data[0].temperature != undefined) {
                    arr = findMinMaxAvg(data,'temperature');
                    entry.temin = arr[0];
                    entry.temax = arr[1];
                    entry.teavg=  arr[2];
                    entry.tecnt = arr[3];
                }
                if (data[0].humidity != undefined) {
                    arr = findMinMaxAvg(data,'humidity');
                    entry.humin = arr[0];
                    entry.humax = arr[1];
                    entry.huavg=  arr[2];
                    entry.hucnt = arr[3];
                }
                if (data[0].pressure != undefined) {
                    arr = findMinMaxAvg(data,'pressure');
                    entry.prmin = arr[0];
                    entry.prmax = arr[1];
                    entry.pravg=  arr[2];
                    entry.prcnt = arr[3];
                }
                resolve({ all:entry, sid:sid});                  // return all the data
            });
        });
    });
    return p;
}



// enter all data for one sensor into DB
async function enterOneSensorinDB(db,name,dt,erg) {
    let s1 = moment();
    let sid = erg.sid;
    let all = erg.all;
    let inserted = {insertedCount: 0};
    try {
        let collName = 'd24_' + sid;                           // build collection name
        let coll = db.collection(collName);
        let ret = await coll.findOne();                         // does it exist?
        if(ret == null) {
            console.log('New Sensor:', sid);                    // no
            await db.createCollection(collName);                // create collectiom
            await coll.createIndex({date: 1},{unique:true});
            inserted = await coll.insertOne(all);               // then insert values
            return(inserted.insertedCount);
        } else {
                    try {
                        inserted = await coll.insertOne(all)
                    }
                    catch(e) {
                        if(e.message.startsWith("E11000 duplicate")) {
                            console.log("Duplicate:",sid);
                            dupCount++;
                        } else {
                            console.log(e, sid);
                        }
                        return 0;
                    }
                }
            }
    catch(e) {
        if(e.message.startsWith("E11000 duplicate")) {
            console.log("Duplicate:",sid);
            dupCount++;
        } else {
            console.log(e, sid);
        }
        return 0;
    }
    enterDB_T.push(moment()-s1);
    return(inserted.insertedCount);
}

