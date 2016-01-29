var Hapi = require('hapi');
var moonboots = require('moonboots_hapi');


var server = new Hapi.Server();

server.connection({
    port: 8200
});

server.register(
  [{
    register: moonboots,
    options: {
      //appPath: '/{p*}',
      developmentMode: true,
      moonboots: {
        main: __dirname + '/app/app.js'
        // browserify: {
        //   transforms: ['brfs']
        // }
      }
    }
  }], function () {
    server.start(function () {
        console.log('started on: http://localhost:8200');
  });
});
