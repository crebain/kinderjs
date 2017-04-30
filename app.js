#!/usr/bin/env node
'use strict';

const program = require('commander');
program
  .version('0.0.1')
//  .option('-o, --option','option description')
//   .option('-m, --more','we can have as many options as we want')
//   .option('-i, --input [optional]','optional user input')
  .option('-u, --email <required>','kindervibe user email')
  .option('-p, --password <required>','kindervibe user password')
  .option('-o, --outdir [optional]', 'directory to put downloaded photos. If not specified, current directory is used.')
  .parse(process.argv); // end with parse to parse through the input

var r = require('request-promise-native');
var request = r.defaults({
    baseUrl: "http://kindervibe.com/api/",
    headers: {
        'Content-Type': 'application/json; charset=UTF-8'
    },
    proxy: "http://localhost:8888",
    json: true
})

request.post("/account/token/").json ({
    email: program.email,
    password: program.password
}).then (r =>
    run (r.token),
        r =>
    console.log (r));


function authRequest (token) {
    var result = request.defaults ({
        headers: {
            authorization: "Token " + token
        }
    });
    return result;
}

function listChildren (token) {
    var auth = authRequest(token);
    var children = auth.get("/child/list/")
        .then (c =>
            c.results);
    return children;
}

function listPhotos (token, child_id) {
    var auth = authRequest(token)
        .defaults ({ baseUrl: null });
    return auth.get ("http://kindervibe.com/api/photos/child/?child_pk=" + child_id)
        .then (r =>
            getPhotos (auth, r));
}

function getPhotos (client, response) {
    if (!response.next)
        return Promise.resolve(response);

    var photos = client.get(response.next)
        .then (p => {
            return getPhotos (client, p)
                .then (p => {
                    return {
                        results: response.results.concat (p.results),
                        next: p.next
                    }
                });
            });

    return photos;
}

function run (token) {
    var promise = listChildren (token)
        .then (c =>
            listPhotos (token, c[1].id));
    if (program.outdir) {
        promise = promise
            .then (r => {
                return fs.mkdir (program.outdir)
                    .then (_ => r);
            })
    }

    promise
        .then (r =>
            writeFiles (r.results));
}

const promisify = require('promisify-node');
const fs = promisify('fs');
const async = require("async");
const path = require('path');
function writeFiles (results) {
    async.eachLimit(results, 8, (data, callback) => {
        var fileName = data.photo.split('/').pop();
        var filePath = data.date + '-' + fileName;
        if (program.outdir) {
            filePath = path.join (program.outdir, filePath);
        }

        var stream = fs.createWriteStream(filePath);
        console.log ("Downloading " + data.photo + " to " + filePath);
        var download = r.get(data.photo);
        download
            .pipe(stream);
        download.on ("end", () => {
            console.log ("Finished downloading " + data.photo + " to " + filePath);
            stream.end();
        });
        download.on("error", err => console.error ("Error while downloading " + data.photo + ": " + err));

        stream.on ("close", () => {
            console.log ("Done " + filePath);
            callback();
        });
    });
}
