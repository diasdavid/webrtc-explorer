var ee2 = require('eventemitter2').EventEmitter2;
var Q = require('q');
var SimplePeer = require('simple-peer');
var AuthenticatedPeerConnection = require('./authenticated-peer-connection.js');
var lz4 = require('lz4');
var msgpack = require('msgpack5')();

if (typeof window === 'undefined') {
    forge = require('node-forge')({disableNativeCode: true});
}


exports = module.exports = PeerConnection;


var GZIP_BUFFERSIZE = 1024;//1024*256;
var USE_ACK = false;
// In the first place, a peer connection is just an abstraction of the peer where the dstId, only needs to be
// provided at creation.
// Furthermore the PeerConnection provides some built in functionality like "pinging"
// config: {
//     dstId : hex ID of the destination peer
//     p12 : base64 encoded p12 file
//     p12password : password of the p12 file
// }
function PeerConnection(config, peer) {
    var self = this;

    self.peerConfig = {
        iceServers: [
            {
                url: 'stun:23.21.150.121', // deprecated, replaced by `urls`
                urls: 'stun:23.21.150.121'
            },
            {
                url:'stun:stun.l.google.com:19302',
                urls:'stun:stun.l.google.com:19302'
            },
            {
                url: "turn:94.199.242.252:3478",
                urls: "turn:94.199.242.252:3478",
                credential: "offloadme",
                username: "power"
            }
        ]
    };

    self.config = config;

    self.tlsServer = null;

    self.events = new ee2({
        wildcard: true,
        newListener: false,
        maxListeners: 20
    });

    self.authenticatedConnection = null;

    var remainingGzipLength = 0;
    var currentlySending = false;
    var sendQueue = [];


    var sysmsgHandlers = {};
    var currentCData = [];
    var currentReceivedGzData = [];

    var tlsKey = null;
    var tlsCert = null;
    var tlsReady = false;

    if('p12' in self.config && self.config.p12) {
        var p12Der = forge.util.decode64(self.config.p12);
        var p12Asn1 = forge.asn1.fromDer(p12Der);
        var p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, self.config.p12password);
        tlsCert = forge.pki.certificateToPem(p12.getBags({bagType: forge.pki.oids.certBag})[forge.pki.oids.certBag][0].cert);
        var keybag = p12.getBags({bagType: forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag][0];
        tlsKey = forge.pki.privateKeyToPem(keybag.key);
    }

    self.send = function (data, forceDht) {

        var strData = JSON.stringify(data);
        //var strData = msgpack.encode(data);

        //console.log("Sending: ", strData);
        var i;
        var msgArray = [];
        var gzippedMsgArray = [];


        //Temporary disable gzip, something with buffers is not working!
        if (strData.length > 1024*1000) {
            console.log(getTime() + ": Creating send buffer");
            var b = msgpack.encode(data);
            //var b = new Buffer(strData);
            console.log(getTime() + ": Compressing message");
            var gzipped = lz4.encode(b);
            console.log(getTime() + ": Compression finished original length: " + strData.length.toString() + " compressed length: " + gzipped.length.toString());
            i = 0;

            if (gzipped.length >= GZIP_BUFFERSIZE) {

                for (i = 0; (i+GZIP_BUFFERSIZE) <= gzipped.length; i += GZIP_BUFFERSIZE) {
                    var newBuffer = new Buffer(GZIP_BUFFERSIZE);
                    gzipped.copy(newBuffer, 0, i, Math.min(i + GZIP_BUFFERSIZE, gzipped.length));
                    //console.log("Adding buffer with length: " + newBuffer.length.toString());
                    gzippedMsgArray.push(newBuffer);
                }

                if (gzipped.length != i) {
                    var restBuffer = new Buffer(gzipped.length - i);
                    gzipped.copy(restBuffer, 0, i, i + restBuffer.length);
                    //console.log("Adding buffer with length: " + restBuffer.length.toString());
                    gzippedMsgArray.push(restBuffer);
                }
            } else {
                //console.log("Adding buffer with length: " + gzipped.length.toString());
                gzippedMsgArray.push(gzipped);
            }

            //for (i = 0; i < strData.length / 200; i++) {
            //    msgArray.push(strData.substr(i * 200, 200));
            //}

            //var r = strData.length - 200 * Math.floor(strData.length / 200);
            //if (r > 0)
            //    msgArray.push(strData.substr(200 * Math.floor(strData.length / 200), r));
        }

        if (self.directChannel && self.directChannel.destroyed) {
            self.directChannel = null;
        }


        if (msgArray.length === 0 && gzippedMsgArray.length == 0) {
            var isAck = true;

            //HACK: bad hack, as buffered amount on webrtc implementation does not seem to work.
            //Acknowledge all packets, before sending next one. Can be removed, when bufferedamount is working correctly
            //Acknowledge id was left 0 by intention, as we anyhow have a reliable connection
            if ('sysmsg' in data && data.sysmsg !== 'ack' && USE_ACK) {
                isAck = false;
                data.ack = 0;
            }

            if (currentlySending && !isAck && USE_ACK) {
                sendQueue.push(data)
            } else if (self.directChannel) {
                currentlySending = !isAck;
                var dataToSend = JSON.stringify(data);
                console.log("Data To Send: " + dataToSend.length.toString());
                self.directChannel.send(dataToSend);
            } else {
                currentlySending = !isAck;
                dhtSend(data);
            }
        } else if (gzippedMsgArray.length == 0) {
            for (i = 0; i < msgArray.length; i++) {
                var toSend = {
                    sysmsg: 'cdata',
                    ack: 0,
                    c: i + 1,
                    cs: msgArray.length,
                    data: msgArray[i]
                };


                if (currentlySending && USE_ACK) {
                    sendQueue.push(toSend)
                } else if (self.directChannel) {
                    currentlySending = true;

                    self.directChannel.send(JSON.stringify(toSend));
                } else {
                    currentlySending = true;
                    dhtSend(toSend);
                }
            }
        } else {

            var length = 0;
            for (i = 0; i < gzippedMsgArray.length; i++) {
                length += gzippedMsgArray[i].length;
            }

            for (i = -1; i < gzippedMsgArray.length; i++) {
                var togzSend;

                if (i == -1) {
                    console.log(getTime() + ": Sending initial gzdata message");
                    togzSend = {
                        sysmsg: 'gzdata',
                        ack: 0,
                        l: length
                    };

                    if (currentlySending && USE_ACK) {
                        sendQueue.push(togzSend)
                    } else if (self.directChannel) {
                        currentlySending = true;

                        self.directChannel.send(JSON.stringify(togzSend));
                    } else {
                        currentlySending = true;
                        dhtSend(togzSend);
                    }

                } else {
                    togzSend = new Buffer(gzippedMsgArray[i]);

                    if (currentlySending && USE_ACK) {
                        sendQueue.push(togzSend)
                    } else if (self.directChannel) {
                        currentlySending = true;
                        console.log("Sending data: %d", togzSend.length);
                        self.directChannel.send(togzSend);
                        console.log("Data sent");
                    } else {
                        currentlySending = true;
                        dhtSend(togzSend.toString('base64'));
                    }
                }


            }

        }


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

    //Tries to build a direct connection with the corresponding endpoint
    self.directConnect = function () {
        var deferred = Q.defer();

        if(typeof(self.directChannel) !== 'undefined' && !self.directChannel.destroyed){
            deferred.resolve(self.directChannel);
            return deferred.promise;
        }

        delete self.directChannel;

        self.pendingChannel = new SimplePeer({initiator: true, wrtc: self.config.wrtc, config: self.peerConfig});

        self.pendingChannel.on('signal', function (signal) {
            console.log('direct offer: ', JSON.stringify(signal));
            dhtSend({sysmsg: 'offer', data: signal});
        });

        self.pendingChannel.on('connect', function () {
            self.directChannel = self.pendingChannel;
            delete self.pendingChannel;
            deferred.resolve();
        });

        self.pendingChannel.on('data', directChannel_onData);

        self.pendingChannel.on('close', function(){
            console.log("Direct data channel closed");
            delete self.directChannel;
        });

        self.pendingChannel.on('error', function(err){
            console.log("Direct data channel error: ", err);
            delete self.directChannel;
        });


        return deferred.promise;
    };

    self.directDisconnect = function () {
        if (self.directChannel) {
            self.directChannel.destroy();
            delete self.directChannel;
        }
    };

    self.destroy = function(){
      self.directDisconnect();

    };

    /* Requests a TLS encrypted connection from the other peer.
     * The other peer is the server, client certificates are not supported at the moment
     */
    self.authenticateConnection = function(cbClosed, cbError){
        var deferred = Q.defer();

        tlsReady = false;
        self.send({sysmsg : 'initiate-tls'});

        self.tls = forge.tls.createConnection({
            server: false,
            sessionCache: {},
            cipherSuites: [forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
            verify: function(connection, verified, depth, certs) {
                if(verified !== forge.pki.certificateError.unknown_ca){
                    return verified;
                }

                self.remoteCertificate = certs[0];
                return true;
            },
            connected: function(connection) {
                tlsReady = true;
                console.log("TLS connected");
                if(self.authenticatedConnection){
                    self.authenticatedConnection.destroy();
                }
                self.authenticatedConnection = new AuthenticatedPeerConnection(self);
                deferred.resolve(self.authenticatedConnection);
            },
            tlsDataReady: function(connection) {
                var d = connection.tlsData.getBytes();
                var db64 = new Buffer(d).toString("base64");
                console.log("tlsDataReady: %s", db64);
                self.send({sysmsg: 'tls-data', data: db64});
            },
            dataReady: function(connection) {
                var data = forge.util.decodeUtf8(connection.data.getBytes()).toString();

                try {
                    console.log("dataReady: %s", data);
                    data.toString().split("\n\n").forEach(function(d){
                        if(d == '') return;
                        var msg = JSON.parse(d);

                        self.authenticatedConnection.events.emit('internal-message', {srcId: self.config.dstId, data: msg});
                    });
                } catch(ex){
                    console.log(ex);
                }
            },
            closed: function(connection) {
                console.log("closed: TLS closed");
                tlsReady = false;
                cbClosed(this);
            },
            error: function(connection, error) {
                console.log("closed: TLS error");
                tlsReady = false;
                cbError(this, error);
            },

            getCertificate: function(connection, hint) {
                console.log("CLIENT getCertificate: %s", hint);
                return tlsCert;
            },
            getPrivateKey: function(connection, cert) {
                console.log("CLIENT getPrivateKey:");
                return tlsKey;
            }
        });
        self.tls.handshake();
        return deferred.promise;
    };

    self.getRemoteCertificateFingerprint = function() {
        if (typeof self.remoteCertificate === 'undefined')
            return null;

        var certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(self.remoteCertificate)).getBytes();

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

    peer.events.on('message', messageHandler);


    function dhtSend(data) {
        peer.send(config.dstId, data);
    }


    function directChannel_onData(data) {
        if(remainingGzipLength > 0 && (data instanceof Buffer || data._isBuffer)){

            var buffer = data;
            console.log("Received: %d" + data,data.length);
            if('data' in data){
                buffer = new Buffer(data.data);
            }

            console.log(getTime() + ": Received gzipped data of size " + buffer.length.toString());

            remainingGzipLength -= buffer.length;
            currentReceivedGzData.push(buffer);

            if(USE_ACK)
                self.send({sysmsg : 'ack', id: 0});


            if(remainingGzipLength == 0){
                console.log(getTime() + ": Starting concatination");
                var compressedBuffer = Buffer.concat(currentReceivedGzData);
                console.log(getTime() + ": Starting Uncompress");
                var uncompressedBuffer = lz4.decode(compressedBuffer);
                console.log(getTime() + ": Uncompress finished length:" + uncompressedBuffer.length.toString());
                //var json = JSON.parse(uncompressedBuffer.toString())
                var json = msgpack.decode(uncompressedBuffer);
                console.log(getTime() + ": JSON parsed");
                currentReceivedGzData = [];
                messageHandler({srcId: self.config.dstId, data: json});
            }
        } else {
            //console.log("Direct channel data: %s", JSON.stringify(data));
            messageHandler({srcId: self.config.dstId, data: data});
        }
    }

    function messageHandler(envelope) {
        if (envelope.srcId !== self.config.dstId) return;

        var writeToLog = false;
        if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'cdata'){
            writeToLog = false;
        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'ack'){
            writeToLog = false;
        }

        if(writeToLog) {
            console.log("MessageHandler: ", envelope.data);
        }

        if('ack' in envelope.data){
            self.send({sysmsg : 'ack', id: envelope.data.ack});
        }

        if('sysmsg' in envelope.data && envelope.data.sysmsg === 'ack') {

            if(sendQueue.length > 0){
                var toSend = sendQueue.shift();

                if(toSend instanceof Buffer || toSend._isBuffer){
                    if (self.directChannel) {
                        currentlySending = true;
                        self.directChannel.send(toSend);
                    } else {
                        currentlySending = true;
                        dhtSend(toSend.toString('base64'));
                    }
                } else {
                    if (self.directChannel) {
                        currentlySending = true;
                        self.directChannel.send(JSON.stringify(toSend));
                    } else {
                        currentlySending = true;
                        dhtSend(toSend);
                    }
                }
            } else {
                currentlySending = false;
            }
        }else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'ping') {
            self.send({'sysmsg': 'pong'});
        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'offer') {
            if (!self.pendingChannel) {
                self.pendingChannel = new SimplePeer({initiator: false, wrtc: self.config.wrtc, config: self.peerConfig});

                self.pendingChannel.on('connect', function () {
                    console.log('direct channel ready');
                    self.directChannel = self.pendingChannel;
                    delete self.pendingChannel;
                });

                self.pendingChannel.on('signal', function (signal) {
                    dhtSend({sysmsg: 'answer', data: signal});
                });

                self.pendingChannel.on('data', directChannel_onData);
                self.pendingChannel.on('close', function(){
                    console.log("Direct data channel closed");
                });

                self.pendingChannel.on('error', function(err){
                    console.log("Direct data channel error: ", err);
                });

            }
            //console.log("SETTING OFFER");
            self.pendingChannel.signal(envelope.data.data);

        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'answer') {
            //console.log("SETTING ANSWER");
            self.pendingChannel.signal(envelope.data.data);

        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg in sysmsgHandlers && sysmsgHandlers[envelope.data.sysmsg].length > 0) {
            var f = sysmsgHandlers[envelope.data.sysmsg][0];
            sysmsgHandlers[envelope.data.sysmsg].shift();
            f();
        }  else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'initiate-tls') {
            console.log("Initiating TLS");
            if (!tlsCert || !tlsKey) {
                self.send({sysmsg: 'abort-tls'});
                console.log("No TLS Cert present");
                return;
            }

            tlsReady = false;
            self.tls = forge.tls.createConnection({
                server: true,
                sessionCache: {},
                cipherSuites: [forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA],
                verifyClient: true,
                verify: function(connection, verified, depth, certs) {
                    if(verified !== forge.pki.certificateError.unknown_ca){
                        return verified;
                    }

                    self.remoteCertificate = certs[0];
                    return true;
                },
                connected: function(connection) {
                    console.log("connected: TLS connected");
                    tlsReady = true;
                    if(self.authenticatedConnection){
                        self.authenticatedConnection.destroy();
                    }
                    self.authenticatedConnection = new AuthenticatedPeerConnection(self);
                    self.events.emit('new-authenticated-connection', self.authenticatedConnection);
                },
                getCertificate: function(connection, hint) {
                    console.log("getCertificate: returning %s", tlsCert);
                    return tlsCert;
                },
                getPrivateKey: function(connection, cert) {
                    console.log("getPrivateKey:");
                    return tlsKey;
                },
                tlsDataReady: function(connection) {
                    var d = connection.tlsData.getBytes();
                    var db64 = new Buffer(d).toString("base64");
                    self.send({sysmsg: 'tls-data', data: db64});
                },
                dataReady: function(connection) {
                    console.log("dataReady: ");
                    var data = forge.util.decodeUtf8(connection.data.getBytes()).toString();
                    try {
                        data.toString().split("\n\n").forEach(function(d){
                            if(d == '') return;
                            var msg = JSON.parse(d);
                            self.authenticatedConnection.events.emit('internal-message', {srcId: self.config.dstId, data: msg});
                        });
                    } catch(ex){
                        console.log(ex, ex.stack);
                    }

                },
                closed: function(connection) {
                    tlsReady = false;
                    console.log('TLS to %s disconnected',self.config.dstId);
                },
                error: function(connection, error) {
                    tlsReady = false;
                    console.log('Error on TLS connection to %s: %s', self.config.dstId, error.message);
                }
            });
            console.log("TLS server part initialized");

        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'tls-data') {
            console.log("tls-data: %s", envelope.data.data);
            if(self.tls){
                self.tls.process(new Buffer(envelope.data.data, "base64"));
            } else {
                console.log("TLS NOT INITIALIZED");
            }
        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'cdata') {
            if(envelope.data.c == 1){
                currentCData = [];
            }

            currentCData.push(envelope.data.data);

            if(envelope.data.c === envelope.data.cs){
                var d = currentCData.join('');
                currentCData = [];
                messageHandler({srcId: self.config.dstId, data: JSON.parse(d)});
            }

        } else if ('sysmsg' in envelope.data && envelope.data.sysmsg === 'gzdata') {
            console.log('GZipped data will follow: ' + envelope.data.l.toString());
            remainingGzipLength = envelope.data.l;
            currentReceivedGzData = [];

        } else {
            self.events.emit('message', envelope);
        }
    }

    function getTime() {
        var now = new Date();
        return now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()+':'+now.getMilliseconds();
    }
}



