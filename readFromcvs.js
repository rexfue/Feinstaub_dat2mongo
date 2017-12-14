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
if (MONGOPORT === undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaub';  	// URL to mongo database
const API_URL = 'http://archive.luftdaten.info/';	            // URL to API on 'luftdaten.info'
const NEWSID_NAME = 'data/newsids_s.txt';               // filename for new sensors

// We store max. one year in our database, that means we start collecting data
// from 2016-11-01 on
const STARTDATE='2016-11-01';

let dBase = null;
let start = moment();
let end, end1;
let sidArray = [];
let insertCount = 0;


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
    end.add(1, 'day');
    let now = moment();
    for (let d = st; d < end; d.add(1, 'day')) {
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


function putOneSensorInDb(name,dt) {
    const p = new Promise((resolve, reject) => {
        let url = API_URL + dt + '/' + name;
        let sid = name.split("_")[3].replace('.csv','');
        putSIDinArray(sid);
        request(url, function (error, response, body) {
            if(response.statusCode != 200) {
                reject("Error",error);
            }
            $.csv.toObjects(body, {separator: ';'}, function (err, data) {
//                console.log("Lang: ", data.length);
                let all = [];
                for (var i = 0; i < data.length; i++) {
                    entry = {};
                    entry.datetime = data[i].timestamp;
                    if(data[i].P1 !== undefined) { entry.P10 = parseFloat(data[i].P1); }
                    if(data[i].P2 !== undefined) { entry.P2_5 = parseFloat(data[i].P2); }
                    if(data[i].temperature !== undefined) { entry.temperature = parseFloat(data[i].temperature); }
                    if(data[i].humidity !== undefined) { entry.humidity = parseFloat(data[i].humidity); }
                    if(data[i].pressure !== undefined) { entry.pressure = parseFloat(data[i].pressure); }
                    all.push(entry)
                }
//                console.log('SID:',sid);
                let coll = dBase.collection(sid+'_saved');
                coll.insertMany(all, function(err,inserted) {
                    if (err) {
                        console.log("Nach insertMany:",err);
                        reject(err);
                    }
                    resolve(inserted.insertedCount);
                });
            });
        });
    });
    return p;
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