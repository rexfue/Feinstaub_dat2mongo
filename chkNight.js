/**
 * Alle Collections prüfen, ob sie in der Nacht zwischen 1:00 und 5:30 online sind.
 * Diejenigen, die nicht online sind, auflisten
 **/

const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;

let MONGOHOST = process.env.MONGOHOST;
let MONGOPORT = process.env.MONGOPORT;
if (MONGOHOST == undefined) { MONGOHOST = 'localhost';}
if (MONGOPORT == undefined) { MONGOPORT =  27017; }

const MONGO_URL = 'mongodb://' + MONGOHOST +':'+MONGOPORT+'/Feinstaubi_A';  	// URL to mongo database

console.log("\n\rStart: ", moment().format("YYYY-MM-DD HH:mm"));

MongoClient.connect(MONGO_URL, function(err,db) {
    if (err) {
        console.log(err);
        process.exit(-1);    
    }	
    startProgram(db)
        .then(() => {
        console.log("Ende: ", moment().format("YYYY-MM-DD HH:mm"));
        db.close();
    });
});



async function startProgram(db) {
    let cnt=0;
    let max = {name: "", max: 0};
	try {
        const collections = await db.listCollections().toArray();    // read all collection names
        for (let x = collections.length-1; x>0; x--) {
            let cname = collections[x].name;
            if (!(cname.startsWith('data'))) {
                continue;
            }
            let co = db.collection(cname);
            let erg = await co.find({
                datetime: {
                    $gte: moment("2018-01-17T00:00:00Z").toDate(),
                    $lt: moment("2018-01-17T04:30:00Z").toDate()
                }
            }, {_id: 0, datetime: 1}).toArray();
            if(erg.length != 0) {
                collections.splice(x,1);
            }
        }
        for(y in collections) {
            console.log(collections[y].name)
        }
        console.log('Anazahl:',collections.length)
    }
	catch(e) {
		console.log(e);
	}
	console.log("Das wars");
}
