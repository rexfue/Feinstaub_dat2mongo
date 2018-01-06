// readFromcsv - Alte Daten vom Luftsdaten per CSV einlesen
//
//  rxf  2017-12-12


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

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database
const API_URL = 'http://archive.luftdaten.info/';	            // URL to API on 'luftdaten.info'
const NEWSID_NAME = 'data/newsids_x.txt';               // filename for new sensors

let dBase = null;
let start = moment();
let end, end1;
let sidArray = [];
let insertCount = 0;

let std = moment().startOf('day').subtract(1,'day');           // yeserday
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
        console.log("\nInserted:",insertCount);
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
        console.log('\n***************', d.format('YYYY-MM-DD')); // log every day
        let mist = false;
        // fetch sensors list of current day
        let list = await getdirlistOfOneDay(d.format('YYYY-MM-DD')).catch( error => { console.log(error); mist = true;});
        if (mist) continue;                                     // if day doesn't exist, continue
        await enterSensors(db,list, d.format('YYYY-MM-DD'));       // fetch an enter sensor data
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
    for (let i=0; i< list.length; i++) {                        // iterate the list
        let icount = await putOneSensorInDb(db,list[i],dt);        // put one sensor data inti DB
        if ((i % 100) == 0) {                                   // write dots to ...
            process.stdout.write('\n' + ('000'+i).slice(-4) + ' ');  // show activity
        }
        insertCount += icount;                                  // add nbr of inserts
        process.stdout.write(insertCount+' ');
    }
}


// read CSV file and enter data
async function putOneSensorInDb(db,name,dt) {
    let erg = await readOneSensorOneDay(name, dt)
    return await enterOneSensorinDB(db,name, dt,erg);
}


// read the CSV-File and parse it int right format for DB
function readOneSensorOneDay(name, dt) {
    const p = new Promise((resolve, reject) => {
        let url = API_URL + dt + '/' + name;                    // construct URL
        let sid = name.split("_")[3].replace('.csv', '');
        request(url, function (error, response, body) {         // request the file
            if((error) || (response.statusCode != 200)) {
                console.log("error readOneSeinsorOneDay:", error);
                reject("Error", error);                         // if not OK, reject
            }
            $.csv.toObjects(body, {separator: ';'}, function (err, data) {  // parse CSV
//                console.log("Lang: ", data.length);
                let all = [];
                for (var i = 0; i < data.length; i++) {
                    entry = {};
                    let date = moment.utc(data[i].timestamp);               // extract date of entry
                    entry.datetime = date.toDate();					        // make date for Mongo (== ISODate)
                    if (data[i].P1 !== undefined) {
                        entry.P1 = parseFloat(data[i].P1);
                    }
                    if (data[i].P2 !== undefined) {
                        entry.P2 = parseFloat(data[i].P2);
                    }
                    if (data[i].temperature !== undefined) {
                        entry.temperature = parseFloat(data[i].temperature);
                    }
                    if (data[i].humidity !== undefined) {
                        entry.humidity = parseFloat(data[i].humidity);
                    }
                    if (data[i].pressure !== undefined) {
                        entry.pressure = parseFloat(data[i].pressure);
                    }
                    all.push(entry)
                }
                resolve({ all:all, sid:sid });                  // return all the data
            });
        });
    });
    return p;
}



// enter all data for one sensor into DB
async function enterOneSensorinDB(db,name,dt,erg) {
    let sid = erg.sid;
    let all = erg.all;
    if(sid == '374') {
        console.log(sid);
    }
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
                inserted = await coll.insertMany(all)              // if collection already existes
            }
        }
    }
    catch(e) {
        console.log(e);
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


