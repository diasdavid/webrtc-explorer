var ee2 = require('eventemitter2').EventEmitter2;
var io = require('socket.io-client');
var Id = require('dht-id');
var Q = require('q');
var FingerTable = require('./finger-table.js');
var ChannelManager = require('./channel-manager.js');
var PeerConnection = require('./peer-connection.js');

if (typeof localStorage === "undefined" || localStorage === null) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    localStorage = new LocalStorage('./scratch');
}

exports = module.exports = Peer;



// config: {
//     signalingURL: <IP or Host of webrtc-ring-signaling-server>
//     logging: defaults to false,
//     createPeerConnections: defaults to false
// }
function Peer(config) {

    if(!("p12" in config)){
        config.p12 = null;
    }
    if(!("p12password" in config)){
        config.p12password = null;
    }


    localStorage.debug = config.logging || false;
    var self = this;

    self.events = new ee2({
        wildcard: true,
        newListener: false,
        maxListeners: 20 
    });

    var peerconnections = {};

    var ioc = io(config.signalingURL + '/', {'force new connection': true });


    ioc.once('connect', connected);
    ioc.on('c-finger-update', function(data, cb) {
        if (!self.fingerTable) {
            console.log('DEBUG: got a finger-update before finger table was ready');
            return;
        }

        self.fingerTable.fingerUpdate(data);
        cb(true);
    });

    ioc.on('c-predecessor', function(data, cb) {
        if (!self.fingerTable) {
            console.log('DEBUG: got a predecessor before finger table was ready');
            return;
        }
        self.fingerTable.predecessorUpdate(data);
        cb(true);
    });


    function connected() {
        console.log('socket.io connection established');
    }

    self.peerConnection = function(dstId){
      if(!(dstId in peerconnections)){
          peerconnections[dstId] = new PeerConnection({dstId: dstId, wrtc: config.wrtc, p12: config.p12, p12password: config.p12password}, self);
      }

      return peerconnections[dstId];
    };
    /// module api

    self.register = function(peerId) {
        ioc.once('c-registered', registered);

        function registered(data) {
            self.peerId = new Id(data.peerId);
            self.channelManager = new ChannelManager(self.peerId,
                                                     ioc,
                                                     router,
                                                     config);
            self.fingerTable = new FingerTable(self.peerId, 
                                               self.events,
                                               self.channelManager);
            var readyEventSent = false;
            self.fingerTable.events.on('fingerUpdate', function(data){
                if(readyEventSent) return;
                //Send the ready event for the first 'fingerUpdate' event
                readyEventSent = true;
                self.events.emit('ready', {});
            });
            self.events.emit('registered', {peerId: data.peerId});
        }

        console.log("Emitting s-register ", peerId);
        ioc.emit('s-register', {'id' : peerId});
    };

    self.updateResourceProviderState = function(enable){
      ioc.emit('update-resource-state', {'provideResources' : enable});
    };

    self.getResourcePeers = function(){
        var deferred = Q.defer();

        ioc.emit('get-resource-peers', null, function(peers){
            deferred.resolve(peers);
        });

        return deferred.promise;
    };


    self.send = function(dstId, data) {
        var envelope = {
            dstId: dstId,
            srcId: self.peerId.toHex(),
            data: data
        };
        
        router(envelope);
    };


    self.destroy = function(){
        ioc.close();
        //ioc.emit('s-unregister', []);
        Object.keys(peerconnections).forEach(function(k){
           peerconnections[k].destroy();
        });

        self.channelManager = null;
        self.fingerTable.destroy();
        self.fingerTable = null;

    };
    /// message router

    function router(envelope) {
        var nextHop = self.fingerTable.bestCandidate(envelope.dstId);
        console.log('nextHop:', nextHop, envelope);
        if (nextHop === self.peerId.toHex() && envelope.dstId === self.peerId.toHex()) {
            if(config.createPeerConnections){
                if(!(envelope.srcId in peerconnections)){
                    peerconnections[envelope.srcId] = new PeerConnection({dstId: envelope.srcId, wrtc: config.wrtc, p12: config.p12, p12password: config.p12password}, self);
                    self.events.emit('new-peerconnection', peerconnections[envelope.srcId]);
                }
                self.events.emit('message', envelope);
                //peerconnections[envelope.srcId].events.emit('message', envelope);
            }
        } else if (nextHop === self.peerId.toHex()){
            return self.events.emit('message-non-routable', envelope);
        } else {
            if(!('path' in envelope)){
                envelope.path = [];
            }
            envelope.path.push(nextHop);
            self.fingerTable.channelTo(nextHop).then(
                function(channel){
                    channel.send(envelope);
                });
        }
    }

}


