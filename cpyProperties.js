/**
 * Properties umkopieren
 *
 * Die Collection 'properties' in eine neuen Collectione
 * kopieren. Dabei
 *  1. _id auf die SID setzen
 *  2. bisheriges sid löschen und
 *  3. duplicates entfernen
 *  Nach umkopieren die alte Collection entfernen und die neue wieder in
 *  'properties' umbenennen (dies MUSS außerhalb dieses Programmes gemacht werden !!)
 **/

const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;

let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST == undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT == undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database
const PROP_COLL='properties';
const DEST_COLL='prop';

let dcount=0;
let allcnt = 0;

let start = moment();
console.log("\n\rStart: ", start.format("YYYY-MM-DD HH:mm"), MONGO_URL);


MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);
    }
    doTheCopy(db)
        .then(() =>
    {
        db.close();
        console.log('allcnt:', allcnt, '  dcount:', dcount);
    });
});

async function doTheCopy(db) {
    try {
        let srccoll = db.collection(PROP_COLL);
        let destcoll = db.collection(DEST_COLL);

        let src = await srccoll.find().toArray();
        console.log('gelesen');
        let i=0;
        for(let x in src) {
            if((i++%100) == 0) {
                process.stdout.write('\n'+i+' ');
            }
            process.stdout.write('.');
            let entry = src[x];
            entry._id = entry.sid;
            delete(entry.sid);
            try {
                await destcoll.insertOne(entry);
                allcnt++;
            }
            catch(e) {
                if (e.message.startsWith("E11000 duplicate")) {
                    dcount++;
                    continue;
                } else {
                    console.log(e, entry._id);
                }
            }
        }
        console.log("copiert");
    }
    catch(e) {
        console.log(e);
    }
}