// readFromcsv - Alte Daten vom Luftsdaten per CSV einlesen
//
//  rxf  2017-12-12


const LIVE=true;

const request = require('request');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
// const lc = require('./locationcheck.js');
let $ = jQuery = require('jquery');
require('./jquery.csv.js');


let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST === undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT === undefined) { MONGOPORT =  27020; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database
const API_URL = 'http://archive.luftdaten.info/';	            // URL to API on 'luftdaten.info'
const NEWSID_NAME = 'data/newsids_x.txt';               // filename for new sensors

// We store max. one year in our database, that means we start collecting data
// from 2016-11-01 on
const STARTDATE='2017-12-15';
const NBROFDAYS=23;

let dBase = null;
let start = moment();
let end, end1;
let sidArray = [];
let insertCount = 0;
var collNames = [];


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);
    }
    dBase = db;
    try {
        var inp = fs.readFileSync(NEWSID_NAME);
        sidArray = JSON.parse(inp);
    }
    catch (e) {
    }
    readSensorsperDay()
        .then((erg) => {
//        console.log("Jetzt sommer da", erg);
        console.log("");
        db.close();
    });
});


async function readSensorsperDay() {
    let st = moment(STARTDATE);
    let end = moment(STARTDATE);
    end.add(NBROFDAYS, 'day');
    let now = moment();
    for (let d = st; d < end; d.add(1, 'day')) {
        let data = await dBase.listCollections().toArray()  // read all collection names for every day
        for (x in data) {
            let n = data[x].name;
//            console.log(x, n);
            if(n.startsWith('data_')) {
                let p = n.split('_');
                collNames.push(p[1]);
            }
        }
        start = moment();
        insertCount = 0;
        console.log('\n***************', d.format('YYYY-MM-DD'));
        let mist = false;
        let list = await getdirlistOfOneDay(d.format('YYYY-MM-DD')).catch( error => { console.log(error); mist = true;});
//        console.log(list);
        if (mist) continue;
        await enterSensors(list, d.format('YYYY-MM-DD'));
        let gz = moment() - start;
        console.log("\nZeit (1 Tag, "+list.length+ " Sensoren, " + insertCount + " Inserts): ",  minsec(gz));
    }
    return new Promise((resolve, reject) => {
        fs.writeFile(NEWSID_NAME, JSON.stringify(sidArray), function (err) {
            if (err) {
                reject(err);
            } else {
//                console.log("alle durch");
                resolve('OK');
            }
        });
    });
}



function getdirlistOfOneDay(day) {
    const p = new Promise((resolve, reject) => {
        request(API_URL + day, function(error, response, body) {
//            console.log(response.statusCode);
            if ((response.statusCode != 200 ) || (error)) {
                console.log(error);
                reject(error);
            }
            let a = body.split('"');
            let list = [];
            for (let i = 0; i < a.length; i++) {
                if (a[i].startsWith(day.substr(0, 4))) {
                    list.push(a[i]);
                }
            }
            resolve(list);
        });
    });
    return p;
}

async function enterSensors(list,dt) {
    for (let i=0; i< list.length; i++) {
        let icount = await putOneSensorInDb(list[i],dt);
        if ((i % 100) == 0) {
            process.stdout.write('\n' + i + ' ');
        }
        process.stdout.write('.');
        insertCount += icount;
//        console.log('Inserted:',icount);
    }
}


async function putOneSensorInDb(name,dt) {
    let erg = await readOneSensorOneDay(name, dt)
    return await enterOneSensorinDB(name, dt,erg);
}


function readOneSensorOneDay(name, dt) {
    const p = new Promise((resolve, reject) => {
        let url = API_URL + dt + '/' + name;
        let sid = name.split("_")[3].replace('.csv', '');
        let sidName = name.split("_")[1].toUpperCase();
        request(url, function (error, response, body) {
            if (response.statusCode != 200) {
                reject("Error", error);
            }
            $.csv.toObjects(body, {separator: ';'}, function (err, data) {
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
                resolve({ all:all, sid:sid, name:sidName });
            });
        });
    });
    return p;
}




async function enterOneSensorinDB(name,dt,erg) {
    let sid = erg.sid;
    let all = erg.all;
    try {
        let collName = 'data_' + sid + '_' + erg.name;
        let coll = dBase.collection(collName);
        if (!collNames.map(c => c).includes(sid)) {                // does it already exist?
            console.log('New Sensor:', sid);
            putSIDinArray(sid);
            await dBase.createCollection(collName);                 // no -> cretate collectiom
            await coll.createIndex({datetime: 1}, {expireAfterSeconds: 2764800})  // expire after 400 days
            let inserted = await coll.insertMany(all)       // then inser values
            return(inserted.count);
        } else {
            let std = moment.utc(dt);
            let endd = moment.utc(dt);
            endd.add(1, 'day');
            let docs = await coll.find({datetime: {$gte: new Date(std), $lt: new Date(endd)}}, {sort: {datetime: 1}}).toArray();
            for (let i = docs.length - 1; i >= 0; i--) {
                for (let a = all.length - 1; a >= 0; a--) {
                    let dt = docs[i].datetime.valueOf();
                    let at = all[a].datetime.valueOf();
                    if (dt == at) {
                        all.splice(a, 1);
                        break;
                    }
                }
            }
            if (all.length > 0) {
                let inserted = {count: 0};
                inserted = await coll.insertMany(all)              // if collection already existes
                return(inserted.count);
            } else {
                return(0);
            }
        }
    }
    catch(e) {
        console.log(e);
    }
}



// Put name of sensor into sidsArray
function putSIDinArray(sid) {
    if (sidArray.indexOf(sid) == -1) {
        sidArray.push(sid);
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



// getdirlistOfOneDay("2016-11-41").then((dl) => {
//    console.log(dl);
//}
//);

/*
var sample = '../data/sample.csv';
fs.readFile(sample, 'UTF-8', function(err, csv) {
    $.csv.toObjects(csv, {separator:';'}, function(err, data) {

        console.log("Lang: ", data.length);
        let all = [];
        for (var i=0; i<data.length; i++) {
            entry = {};
            entry.datetime = data[i].timestamp;
            entry.P10 = data[i].P1;
            entry.P2_5 = data[i].P2;
            all.push(entry)
        }
// Hier est checken, ob die collection schon existiert. Wenn nein, dann das prop ertsellen
// und eintragen (damit den datensatz erzeugen). Falls ja, das Erstellen des prop übergehen

// ****** wie das mit den othersensors hin bekommen ???????  *****************


        let prop = { properties: {
            name: data[0].sensor_type,
            since_date: '1900-01-01',
            location: {
                longitude: data[0].lon,
                latitude: data[0].lat,
                altitude: 0,                            // Adresse und altitude von Google erfragen !!!!!
                since_date: '1900-01-01',
                address: {
                    street: 'Forststr. 66a',
                    plz: 70176,
                    city: 'Stuttgart',
                    country: 'Germany'
                }
            }
        }};

// hier dann das komplette (!!) array 'all' mit bulkinsert (inseret_many) eintragen


        console.log(all);
    });
});



// Die Daten des 5min-Abhiolens sehen ja ganz anders aus, sind also auch anders zu behandeln (siehe D2M-Projekt)
*/