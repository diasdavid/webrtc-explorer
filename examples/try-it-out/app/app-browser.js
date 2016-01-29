var Explorer = require('./../../../src/explorer.js');
var uuid = require('uuid');
var Id = require('dht-id');
var CA = require('../../../src/lib/CA.js');
var zlib = require('zlibjs');
var lz4 = require('lz4');

var msgpack = require('msgpack5')(); // namespace our extensions

var l = [];
for(var xy = 0; xy<1000000; xy++){
    l.push(xy);
}

var todo = {
    offload: 'blabla',
    blabla: '1234',
    qwert: '3333',
    test: [1,2,3],
    result: new Buffer(l)
};

var time = new Date().getTime();
var time2;
console.log(time.toString() + ": start stringify");
//var s = JSON.stringify(todo);
var s = msgpack.encode(todo);
console.log(s.length);
time2= new Date().getTime();
console.log(time2.toString() + " " + (time2 - time).toString() +  ": finished stringify");
time = time2;
//var j = JSON.parse(s);
var j = msgpack.decode(s);
time2=new Date().getTime();
console.log(time2.toString() + " " + (time2 - time).toString() +  ": finished parse");
return;

var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var text = "";
for( var i=0; i < 1024*1024; i++ ) {
    var bla = possible.charAt(Math.floor(Math.random() * possible.length));
    text += bla + bla + bla ;
}

console.log("Start compression: " + text.length.toString());
var result = zlib.gzipSync(new Buffer(text));
console.log("Finished compression: " + result.length.toString());
var input = new Buffer(text);
result = new Buffer(lz4.encodeBound(input.length));
var compressedSize = lz4.encodeBlock(input, result);
result = result.slice(0, compressedSize);
console.log("Finished compression: " + result.length.toString());
return;

console.log('start');

var config = {
    signalingURL: 'http://localhost:9000',
    logging: true,
    createPeerConnections: true,
    p12: new CA().createSelfSignedCertificate("POWER: offloadme", "AT", "My Location", "IAIK", ""),
    p12password: ''
};


var idBase = "client";

var peer = new Explorer(config);
var myPeerId = "browser"; //uuid.v4();

peerGlobal = peer;

peer.events.on('registered', function(data) {
    console.log('registered with Id:', data.peerId);
    peer.updateResourceProviderState(true);
});

peer.events.on('ready', function() {
    console.log('READY: ready to send messages');

    setTimeout(function(){

        var dhtTime;
        var directTime;
        var tlsTime;
        var peerId;
        discoverRandomPeer()
            .then(function(p){peerId = p; return p;})
            .then(doPing)
            .then(function (t){dhtTime = t; return peerId;})
            .then(doDirectConnect)
            .then(function(c){return doPing(peerId);})
            .then(function(t){
                directTime = t;
                console.log("DHT/Direct ping time %d/%d", dhtTime, directTime);
                return peerId;
            }).then(doAuthenticateConnection)
            .then(function(authC){
                console.log(forge.pki.certificateToPem(authC.remoteCertificate));
                console.log(authC.getRemoteCertificateFingerprint());
                tlsTime = new Date().getTime();
                return authC.ping();
            })
            .then(function(){
                tlsTime = new Date().getTime() - tlsTime;
                console.log("TLS ping time %d", tlsTime);
            });
        //doPing(Id.hash("client2")).then(function(){

        //});
    }, 2000);
});

peer.events.on('message', function(envelope) {
    //console.log('MESSAGE: %s', JSON.stringify(envelope.data));
});

peer.events.on('message-non-routable', function(envelope) {
    //console.log('NON-ROUTABLE MESSAGE to %s', envelope.dstId);
});

peer.events.on('new-peerconnection', function(peerconnection){
    console.log("NEW PEER CONNECTION FROM %s", peerconnection.config.dstId);
   peerconnection.events.on('message', function(envelope){
      //console.log("PEERCONNECTION: %s", JSON.stringify(envelope));
   });
});

peer.register(myPeerId);

function doPing(id){
    var p = peer.peerConnection(id);
    var tick = new Date().getTime();

    var pong = (function(d) {
        var time = new Date().getTime() - tick;
        console.log("Ping completed %d", time);
        return time;
    });
    return p.ping("").then(pong);
}

function doDirectConnect(id){
    console.log("Building a direct connection");
    var p = peer.peerConnection(id);
    return p.directConnect();
}

function discoverRandomPeer(){
    return peer.getResourcePeers().then(function(peers){
        return Id.hash("client2");
        /*if(peers.length == 0){
            return null;
        } else {
            return peers[0];
        }*/
    });
}

function doAuthenticateConnection(id){
    var p = peer.peerConnection(id);
    return p.authenticateConnection(function(myp){
        console.log("Disconnected");
    }, function(myp, error){
        console.log("Error: ", error);
    });
}