var SimplePeer = require('simple-peer');

exports = module.exports = ChannelManager;


var _pendingConnections = {};

function ChannelManager(peerId, ioc, router, config) {
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

    /// establish a connection to another peer

    self.connect = function(dstId, cb) {
        console.log('connect to: ', dstId);

        var intentId = (~~(Math.random() * 1e9))
                        .toString(36) + Date.now();

        var channel = new SimplePeer({initiator: true, wrtc: config.wrtc, config: self.peerConfig});

        channel.on('signal', function (signal) {
            console.log('sendOffer %s', JSON.stringify(signal));
            ioc.emit('s-send-offer', {offer: {
                intentId: intentId,
                srcId: peerId.toHex(),
                dstId: dstId,
                signal: signal
            }});
        });

        channel.on('connect', function() {
            //delete _pendingConnections[dstId];
            console.log('channel ready to send');
            channel.on('data', function(){
                console.log('DEBUG: this channel should be '+
                    'only used to send and not to receive');
            });
            cb(null, channel);
        });



        var listener = ioc.on('c-offer-accepted', offerAccepted);

        function offerAccepted(data) {
            if(data.offer.intentId !== intentId) { 
//                log('OK: not right intentId: ',
//                        data.offer.intentId, intentId);
                return; 
            }
            console.log('offerAccepted: %s', JSON.stringify(data.offer.signal));

            if(channel.destroyed){
                console.log("Ignoring signal for already destroyed channel");
            } else {
                channel.signal(data.offer.signal);
            }

        }
    };

    /// accept offers from peers that want to connect

    ioc.on('c-accept-offer', function(data) {
        console.log('acceptOffer: %s', JSON.stringify(data));

        var channel;
        if(data.offer.signal && data.offer.signal.type === 'offer'){
            delete _pendingConnections[data.offer.srcId];
        }

        if(!(data.offer.srcId in _pendingConnections)){
            channel = new SimplePeer({wrtc: config.wrtc, config: self.peerConfig});
            channel.on('connect', function() {
                console.log('channel ready to listen');
                delete _pendingConnections[data.offer.srcId];
                channel.on('data', router);
            });

            channel.on('signal', function (signal){
                // log('sending back my signal data');
                data.offer.signal = signal;
                ioc.emit('s-offer-accepted', data);
            });



            _pendingConnections[data.offer.srcId] = channel;
        } else {
            channel = _pendingConnections[data.offer.srcId];
        }

        if(channel.destroyed){
            console.log("Ignoring signal for already destroyed channel");
        } else {
            console.log(data.offer.signal);
            channel.signal(data.offer.signal);
        }
    });

}
