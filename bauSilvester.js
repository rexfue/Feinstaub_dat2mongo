/**
 * Datum, das keine ISO-Date sondern ein String ist, löschen aus allen Collections
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
    let sico = db.collection("silvester");
    let silv = {}
	try {
        const collections = await db.listCollections().toArray();    // read all collection names
        console.log("Anzahl collections:", collections.length);
        for (let x in collections) {
            let cname = collections[x].name;
            if (!(cname.startsWith('data'))) {
                continue;
            }
            let co = db.collection(cname);
            let erg = await co.find({
                datetime: {
                    $gte: moment("2017-12-31T11:00:00Z").toDate(),
                    $lt: moment("2018-01-01T11:00:00Z").toDate()
                }
            }, {_id: 0}).toArray();
            if (!((erg == null) || (erg == undefined) || (erg.length == 0))) {
                silv._id = parseInt(cname.substr(5));
                silv.data = erg;
                await
                    sico.insertOne(silv);
                console.log("Inserted:", cname, erg.length);
            } else {
                console.log("skipped:",cname);
            }
        }
	}
	catch(e) {
		console.log(e);
	}
	console.log("Das wars");

}

/*

async function doTheEntry(entries) {
    const collections = await dBase.listCollections().toArray();    // read all collection names
    let inserted = 0;                                           // count number of inserted records
    let korr = dBase.collection(PROP_COLL);
    console.log("Einträge gesamt:",entries.length);
    for (let i=0; i< entries.length; i++) {                     // loop through all entries
        let cursid = entries[i].sid;                            // extract current SID
        let cname = 'data_'+cursid;                             // build collection name
        var coll = dBase.collection(cname);                     // use this collection
//  	console.log(entries[i]);
        try {
            if (!collections.map(c => c.name).includes(cname)) {  // does it already exist in collections?
                console.log("New:", cname);                     // no -> show it it
                await dBase.createCollection(cname);            // create collection
                // and set TTL Index to 32 days
                await coll.createIndex({datetime: 1}, {expireAfterSeconds: 2764800}, {unique: true});
            } else {                                            // collection exists
                try {
                    const doc = korr.findOne({_id:cursid});      // does it exist in properties?
                    if(doc == null) {
                        await korr.insertOne(entries[i].properties);  // no, then save properties
                    }
                    inserted = await coll.insertMany(entries[i].values);  // save new values in collection
                    icount += inserted.insertedCount;
                }
                catch (e) {
                    if(e.message.startsWith("E11000 duplicate")) {
//                        console.log("Duplicate:",entries[i].sid);
                        dcount++;
                        continue;
                    } else {
                        console.log(e, cname);
                    }
                }
            }
        }
        catch(err) {
            console.log(err);
        }
    }
}


async function doMapEntry(entries) {
    let mapcoll = dBase.collection(MAP_COLL);
    await mapcoll.drop();                                       // remover collection
    await dBase.createCollection(MAP_COLL);
    await mapcoll.createIndex({location: "2dsphere"});      // and on Location

    for (x in entries) {                     // loop through all entries
        let one = entries[x];
        try {
            let toEnter = {};
            if('P1' in one.values[0]) {
                toEnter.values = one.values[one.values.length - 1];
                toEnter._id = one.sid;
                toEnter.location = one.properties.location[one.properties.location.length - 1].loc;

                let inserted = await mapcoll.insertOne(toEnter);
//                console.log(inserted.insertedCount);
            }
        }
        catch(e) {
            console.log("doMapEntry: ", one.sid, e);
        }
    }

}

// Check lat/lon and convert to float
function checkLatLon(w) {
    if ((w == null) || (w == "")) {
        return 0.0;
    } else {
        return parseFloat(w);
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

// Check, if 'my' sensors are still alive:
// Compare dates in read-in file. If date is older than 1 hour, send out mail,
// then store aktual dates
// Data:
// [{ sid,cnt}, {sid, cnt}, {}, ... ]
function checkMySids(ms) {
    let body = "";
    for(let i=0; i<ms.length; i++) {
        if (--ms[i].cnt == 0) {
            body += "Sensor " + ms[i].sid + " von " + ms[i].name + " sendet seit einer Stunde nicht mehr\n"
        }
    }
    if (body != "") {
        console.log(body);

        // setup email data with unicode symbols
        let mailOptions = {
            from: '"Feinstaub" <rxf@fuerst-stuttgart.de>',            // sender address
            to: 'rexfue@gmail.com',                     // list of receivers
            subject: 'Feinstaubsensor(en) ausgefallen', // Subject line
            text: body // plain text body
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
        });
    }
}

// Mark sensor in array masids as aktive
function markMySids(mysids,sid) {
    let idx = mysids.findIndex(function (obj) {
        return obj.sid === sid;
    });
    if (idx != -1) {
        mysids[idx].cnt = ACTVE_CNT;
        console.log("found:", sid);
    }
}

// Put paramater to MQTT (Thingspeak)
function put2MQTT(data1,data2) {
    let cmd = '&field1='+data1/1000;
    dBase.stats(function(err,erg) {
        cmd += '&field2='+parseInt(erg.objects) + '&field3='+parseInt(erg.storageSize) + '&field4='+parseInt(allcount);
        request.get('https://api.thingspeak.com/update?api_key=VDOH97IK7E92YT3Z'+cmd, function (err, resp, bod) {
            if(err) {
                console.log(err);
            } else {
                if(resp.statusCode == 200) {
                    console.log("TheThings meldet: ",bod);
                }
            }
        });
    });
}
*/
