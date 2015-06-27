var http = require('http')
var createHandler = require('./github-webhook-handler')
var handler = createHandler({
   path: '/webhook',
   secret: process.env.secret || 'myhashsecret'
})
var fs = require("fs");
var path = require("path");
var _ = require('lodash');
var Promise = require('promise')
var procstreams = require('procstreams');
var Class = require("wires-class");
var Stream = require('stream').Stream


var Bash = Class.extend({
   initialize: function(cmd) {
      this.cmd = cmd ? [cmd] : [];
   },
   add: function() {
      _.each(arguments, function(arg) {
         this.cmd.push(arg);
      }, this)
   },
   call: function(opts) {
      var opts = opts || {};
      var onStream = opts.onStream
      var onError = opts.onError;
      var pipes = opts.pipes || [];
      var ignoreErrors = opts.ignoreErrors;
      var printOutput = opts.printOutput;
      var self = this;
      return new Promise(function(resolve, reject) {
         var stream = new Stream()
         stream.writable = true
         stream.read = onStream
         stream.write = function(a) {
            if (printOutput) {
               console.log(a.toString().trim())
            }
            onStream ? onStream(a.toString()) : null;
         }
         stream.end = function() {}


         var errStream = new Stream()
         errStream.writable = true
         errStream.write = function(a) {
            onError ? onError(a.toString()) : null;
         }
         errStream.end = function() {}
         var fullcmd = self.cmd.join(' ');


         var proc = procstreams(fullcmd).data(function(err, stdout, stderr) {
            if (err) {
               if (ignoreErrors) {
                  return resolve();
               }
               return reject({
                  err: err,
                  out: (stderr ? stderr.toString() : undefined)
               });
            }
            return resolve(stdout ? stdout.toString().split("\n") : undefined)
         })
         _.each(pipes, function(item) {
            proc = proc.pipe(item)
         })
         proc.pipe(stream, {
            stderr: errStream
         })
      });
   }
})


var port = process.env.PORT || 7777;
http.createServer(function(req, res) {
   console.log("Listening on http://localhost:" + port + "/webhook")
   handler(req, res, function(err) {
      res.statusCode = 404
      res.end('no such location')
   })
}).listen(port)

handler.on('error', function(err) {
   console.error('Error:', err.message)
})

var current = process.cwd();
var conf = path.join(current, "github.json");
if (fs.existsSync(conf)) {
   console.log("Config loaded")
   var config = JSON.parse(fs.readFileSync(conf));

   handler.on('push', function(event) {
      for (var repName in config) {
         if (repName === event.payload.repository.name) {
            var branches = config[repName];
            for (var branch in branches) {
               if (event.payload.ref.indexOf(branch) > -1) {
                  var cmd = branches[branch]
                  var bash = new Bash();
                  console.log(cmd)
                  bash.add(cmd)
                  bash.call({
                     printOutput: true
                  }).then(function(d) {
                     console.log(d)
                  }).catch(function(e) {
                     console.log(e)
                  })

               }
            }
         }
      }
      var repositoryName = event.payload.repository.name;
      var branch = event.payload.ref;
   })
} else {
   console.log("no config")
}
