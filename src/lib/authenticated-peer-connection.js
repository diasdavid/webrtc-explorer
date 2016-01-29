var ee2 = require('eventemitter2').EventEmitter2;
var Q = require('q');
var SimplePeer = require('simple-peer');
var PeerConnection = require('./peer-connection.js');

if (typeof window === 'undefined') {
    forge = require('node-forge')({disableNativeCode: true});
}


exports = module.exports = AuthenticatedPeerConnection;

function AuthenticatedPeerConnection(peerconnection) {
    var self = this;
    self.peerConnection = peerconnection;
    self.remoteCertificate = peerconnection.remoteCertificate;

    self.events = new ee2({
        wildcard: true,
        newListener: false,
        maxListeners: 20
    });

    var sysmsgHandlers = {};
    var destroyed = false;

    self.send = function (data, forceDht) {
        var strData = JSON.stringify(data);
        self.peerConnection.tls.prepare(strData + "\n\n");
    };


    self.ping = function (data) {
        var deferred = Q.defer();
        var finished = false;

        if (!("pong" in sysmsgHandlers)) {
            sysmsgHandlers["pong"] = [];
        }

        sysmsgHandlers["pong"].push(function () {
            if (!finished) {
                finished = true;
                deferred.resolve(data);
            }
        });

        setTimeout(function () {
            if (!finished) {
                deferred.reject(data);
            }
        }, 10000);

        self.send({'sysmsg': 'ping'});

        return deferred.promise;
    };


    self.getRemoteCertificateFingerprint = function() {
        if (typeof self.peerConnection.remoteCertificate === 'undefined')
            return null;

        var certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(self.peerConnection.remoteCertificate)).getBytes();

        var fingerprint = forge.md.sha1.create();
        fingerprint.update(certDer);
        var fingerprint_str = '';
        for (pos = 0; fingerprint.digest().toHex().length > pos; pos += 2) {
            fingerprint_str += fingerprint.digest().toHex().charAt(pos) + fingerprint.digest().toHex().charAt(pos + 1);
            if ((pos + 2) < fingerprint.digest().toHex().length) {
                fingerprint_str += ':';
            }

        }

        return fingerprint_str;
    };

    self.destroy = function(){
        destroyed = true;
    };

    self.events.on('internal-message', messageHandler);

    function messageHandler(envelope) {
        if(destroyed) return;
        if (envelope.srcId !== self.peerConnection.config.dstId) return;

        if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'ping') {
            self.send({'sysmsg': 'pong'});
        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg in sysmsgHandlers && sysmsgHandlers[envelope.data.sysmsg].length > 0) {
            var f = sysmsgHandlers[envelope.data.sysmsg][0];
            sysmsgHandlers[envelope.data.sysmsg].shift();
            f();
        } else {
            self.events.emit('message', envelope);
        }
    }
}



