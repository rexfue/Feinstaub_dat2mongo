const request = require('request');
const moment = require('moment');

const API_URL = 'https://fstst.rexfue.de/api/getdata';

function getAPI() {
    request(API_URL+'?sensorid=140&span=3&avg=30', function (error, response, body) {    // fetch the list
        console.log(response.statusCode);
        if ((response.statusCode != 200) || (error)) {     // if not OK
            console.log(error);                             // log error
            return error                                  // and return the rror
        }
        console.log(body);
    });
}


getAPI();
