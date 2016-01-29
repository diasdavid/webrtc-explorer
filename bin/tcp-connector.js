/**
 * Created by areiter on 7/27/15.
 */
var net = require('net');
var btoa = require('btoa');
var uuid = require('uuid');
var explorer = require('../src/explorer.js');
var Id = require('dht-id');
var forge = require('node-forge');
var wrtc = require('wrtc');

var port = parseInt(process.argv[2]);
console.log('Starting server at ' + process.argv[2]);

var server = net.createServer(function(socket){


    var objectStore = {};
    var clientIdToPeerConnection = {};

    var cachedData = "";

    socket.on("data", function(data){
        //console.log("TCP-connector received: ", data.toString() );

        try {
            cachedData += data;
            var i = cachedData.indexOf("\n\n");
            while(i>-1) {
                var currentData = cachedData.substring(0, i);
                cachedData = cachedData.substring(i+2);

                if(currentData !== '') {
                    var msg = JSON.parse(currentData);
                    console.log("Data length: %s Data: %s", currentData.length.toString(), currentData);
                    dispatcher(msg, socket);
                }
                i = cachedData.indexOf("\n\n");
                /*data.toString().split("\n\n").forEach(function (d) {
                    if (d == '') return;
                    var msg = JSON.parse(d);
                    dispatcher(msg, socket);
                });
                */
            }
        } catch(ex){
            console.log(ex);
        }

    });

    socket.on('error', function(e){
        console.log('Socket Error: ', e);
    });

    socket.on('close', function(e){
        Object.keys(objectStore).forEach(function(k){

            if(typeof objectStore[k].destroy === "function"){
                objectStore[k].destroy();
            }
        });
    });

    function send(data, socket){
        console.log("Sending: %s", JSON.stringify(data));
        try {
            socket.write(JSON.stringify(data) + '\n\n');
        } catch(ex){
            console.log("Socket send error: ", ex);
        }
    }

    function dispatcher(msg, socket){
        if(msg['type'] === "configureAndConnect"){
            configureAndConnect(msg, socket);
        } else if(msg['type'] === "getPeerConnection"){
            getPeerConnection(msg, socket);
        } else if(msg['type'] === "PeerConnection_send"){
            peerConnection_send(msg, socket);
        } else if(msg['type'] === "PeerConnection_ping"){
            peerConnection_ping(msg, socket);
        } else if(msg['type'] === "PeerConnection_directConnect"){
            peerConnection_directConnect(msg, socket);
        } else if(msg['type'] === "PeerConnection_directDisconnect"){
            peerConnection_directDisconnect(msg, socket);
        } else if(msg['type'] === "PeerConnection_authenticateConnection"){
            peerConnection_authenticateConnection(msg, socket);
        } else if(msg['type'] === "PeerConnection_getRemoteCertificateFingerprint"){
            peerConnection_getRemoteCertificateFingerprint(msg, socket);
        }  else if(msg['type'] === "PeerConnection_getRemoteCertificate"){
            peerConnection_getRemoteCertificate(msg, socket);
        }  else if(msg['type'] === "updateResourceProviderState"){
            updateResourceProviderState(msg, socket);
        }  else if(msg['type'] === "getResourcePeers"){
            getResourcePeers(msg, socket);
        }
    }

    function configureAndConnect(msg, socket){

        msg.args[0].logging = true;
        msg.args[0].createPeerConnections = true;
        msg.args[0].wrtc = wrtc;

        objectStore[msg.objectId] = new explorer(msg.args[0]);
        objectStore[msg.objectId].register(msg.args[1]);


        objectStore[msg.objectId].events.on('registered', function(data) {
            console.log("Sending event 'registered' for object ", msg.objectId);
            send({
                'type': 'event',
                'objectId': msg.objectId,
                'event': 'registered',
                'data': data
            }, socket);
        });


        objectStore[msg.objectId].events.on('ready', function() {
            console.log("Sending event 'ready' for object ", msg.objectId);
            send({
                'type': 'event',
                'objectId': msg.objectId,
                'event': 'ready'
            }, socket);
        });

        objectStore[msg.objectId].events.on('message', function(envelope) {
            send({
                'type': 'event',
                'objectId': msg.objectId,
                'event': 'message',
                'data' : envelope
            }, socket);
        });

        objectStore[msg.objectId].events.on('message-non-routable', function(envelope) {
        });

        objectStore[msg.objectId].events.on('new-peerconnection', function(peerconnection){
            var peerconnectionId = uuid.v4();
            clientIdToPeerConnection[peerconnection.config.dstId] = peerconnectionId;
            objectStore[peerconnectionId] = peerconnection;
            peerconnection.events.on('new-authenticated-connection', function(authenticatedConnection){
                var authId = uuid.v4();
                objectStore[authId] = authenticatedConnection;


                send({
                    'type': 'event',
                    'objectId': peerconnectionId,
                    'event': 'new-authenticated-connection',
                    'authId': authId
                }, socket);

                authenticatedConnection.events.on('message', function(envelope){
                    send({
                        'type': 'event',
                        'objectId': authId,
                        'event': 'message',
                        'data': envelope
                    }, socket);
                });
            });

            send({
                'type': 'event',
                'objectId': msg.objectId,
                'event': 'new-peerconnection',
                'peerconnection-id': peerconnectionId,
                'peer-id' : peerconnection.config.dstId
            }, socket);

            peerconnection.events.on('message', function(envelope){
                send({
                    'type': 'event',
                    'objectId': peerconnectionId,
                    'event': 'message',
                    'data': envelope
                }, socket);
            });
        });
    }

    function getPeerConnection(msg, socket){
        var peerId = /*Id.hash(*/msg.args[0];/*);*/
        if(!(peerId in clientIdToPeerConnection)){
            var peerconnectionid = uuid.v4();
            objectStore[peerconnectionid] = objectStore[msg.objectId].peerConnection(peerId);
            clientIdToPeerConnection[peerId] = peerconnectionid;
        }

        send({
            'type': 'r',
            'callId': msg['callId'],
            'data': clientIdToPeerConnection[peerId]
        }, socket);
    }

    function updateResourceProviderState(msg, socket){
        objectStore[msg.objectId].updateResourceProviderState(msg.args[0]);
    }

    function getResourcePeers(msg, socket){
        objectStore[msg.objectId].getResourcePeers()
            .then(function(peers){
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'peers' : peers
                }, socket);
            });
    }

    function peerConnection_send(msg, socket){
        objectStore[msg.objectId].send(msg.args[0], false);
    }

    function peerConnection_ping(msg, socket){
        objectStore[msg.objectId].ping("")
            .then(function(data){
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'success' : 1
                }, socket);
            })
            .catch(function (err){
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'success' : 0,
                    'error' : err
                }, socket);
            });
    }

    function peerConnection_directConnect(msg, socket){
        objectStore[msg.objectId].directConnect()
            .then(function(){
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'success' : 1
                }, socket);
            })
            .catch(function (err){
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'success' : 0,
                    'error' : err
                }, socket);
            });
    }

    function peerConnection_authenticateConnection(msg, socket){
        objectStore[msg.objectId].authenticateConnection(function(peer){
            //closed
            send({
                'type': 'event',
                'objectId': msg.objectId,
                'event': 'authenticated-connection-closed'
            }, socket);
        }, function(myp, error){
            //error
            send({
                'type': 'event',
                'objectId': msg.objectId,
                'event': 'authenticated-connection-error',
                'data' : error
            }, socket);
        })
            .then(function(authenticatedConnection){
                var authenticatedConnectionId = uuid.v4();
                objectStore[authenticatedConnectionId] = authenticatedConnection;
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'authId' : authenticatedConnectionId,
                    'success' : 1
                }, socket);
            })
            .catch(function (err){
                send({
                    'type': 'r',
                    'callId': msg['callId'],
                    'success' : 0,
                    'error' : err
                }, socket);
            });
    }

    function peerConnection_directDisconnect(msg, socket){
        objectStore[msg.objectId].directDisconnect();
    }

    function peerConnection_getRemoteCertificateFingerprint(msg, socket){
        send({
            'type': 'r',
            'callId': msg['callId'],
            'data' : objectStore[msg.objectId].getRemoteCertificateFingerprint()
        }, socket);
    }

    function peerConnection_getRemoteCertificate(msg, socket){
        var remoteCert = objectStore[msg.objectId].remoteCertificate;
        var bla = forge.pki.certificateToPem(remoteCert);
        send({
            'type': 'r',
            'callId': msg['callId'],
            'data' : forge.pki.certificateToPem(objectStore[msg.objectId].remoteCertificate)
        }, socket);
    }

});


server.listen(port);







