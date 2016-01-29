var Explorer = require('./../../../src/explorer.js');
var uuid = require('uuid');
var Id = require('dht-id');
var wrtc = require('wrtc');
var forge = require('node-forge');
var zlib = require('zlibjs');
var lz4 = require('lz4');
fs = require('fs');
var CA = require('../../../src/lib/CA.js');
var msgpack = require('msgpack5')(); // namespace our extensions

console.log('start');

var l = [];
for(var xy = 0; xy<1000000; xy++){
    l.push(xy);
}
console.log(Array.isArray(l));

var todo = {
    offload: 'blabla',
    blabla: '1234',
    qwert: '3333',
    test: [1,2,3],
    result: l
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
result = lz4.encode(input);
console.log("Finished compression: " + result.length.toString());
result = lz4.decode(result);
console.log(result.toString());
return;

var myPeerId = uuid.v4();

if(process.argv.length > 2) {
    myPeerId = process.argv[2];
}

var p12 = undefined;

try {
    var content = fs.readFileSync('/home/areiter/' + myPeerId + '.p12');
    p12 = content.toString('base64');
} catch(err){

}


var config = {
    signalingURL: 'http://localhost:9000',
    logging: true,
    createPeerConnections: true,
    wrtc: wrtc,
    p12: p12,
    p12password: 'test'
};

var peer = new Explorer(config);


peerGlobal = peer;

peer.events.on('registered', function(data) {
    console.log('registered with Id:', data.peerId);
    peer.updateResourceProviderState(true);
});




peer.events.on('ready', function() {
    console.log('READY: ready to send messages');

    //if(myPeerId.indexOf('client') === 0){
    if(myPeerId === 'client1'){
        setTimeout(function(){

            var dhtTime;
            var directTime;
            var peerId;
            discoverRandomPeer()
                .then(function(p){peerId = Id.hash("client2"); return peerId;})
                //.then(doDirectConnect)
                //.then(function(){return peerId;})
                .then(doPing)
                .then(function(){return peerId;})
                .then(doAuthenticateConnection)
                .then(function(authenticatedConnection){
                    var p = peer.peerConnection(peerId);
                    console.log(forge.pki.certificateToPem(p.remoteCertificate));
                    console.log(p.getRemoteCertificateFingerprint());
                }).then(function(){return peerId;})
                .then(doAuthPing);
                //.then(doSendData);
                //.then(doPing);
                //.then(function (t){dhtTime = t; return peerId;})
                //.then(doDirectConnect)
                //.then(function(c){return doPing(peerId);})
                //.then(function(t){
                //    directTime = t;

                //    console.log("DHT/Direct ping time %d/%d", dhtTime, directTime);
                //})
                //.then(function(c){return doPing(peerId);})
                //.then(function(t){
                //    directTime = t;

                //    console.log("DHT/Direct ping time %d/%d", dhtTime, directTime);
                //});
            //doPing(Id.hash("client2")).then(function(){

            //});
        }, 2000);

    }
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

function doAuthenticateConnection(id){
    var p = peer.peerConnection(id);
    return p.authenticateConnection(function(myp){
        console.log("Disconnected");
    }, function(myp, error){
        console.log("Error: ", error);
    });
}

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

function doAuthPing(id){
    var p = peer.peerConnection(id);
    var tick = new Date().getTime();

    var pong = (function(d) {
        var time = new Date().getTime() - tick;
        console.log("Ping completed %d", time);
        return time;
    });
    return p.authenticatedConnection.ping("").then(pong);
}

function doSendData(id){
    var data = "";
    for(var i = 0; i<50; i++)
        data += Math.random().toString(36).substr(2,10);

    var p = peer.peerConnection(id);
    p.send({data:data});
}

function doDirectConnect(id){
    var p = peer.peerConnection(id);
    return p.directConnect();
}

function discoverRandomPeer(){
    return peer.getResourcePeers().then(function(peers){
        if(peers.length == 0){
            return null;
        } else {
            if(peers[0] === myPeerId){
                console.log("MYPEERID");
                exit(0);
            }
            return peers[0];
        }
    });
}