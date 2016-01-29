var ee2 = require('eventemitter2').EventEmitter2;
var Q = require('q');
var Id = require('dht-id');

exports = module.exports = FingerTable;

function FingerTable (peerId, events, channelManager) {
    var self = this;

    self.events = new ee2({
        wildcard: true,
        newListener: false,
        maxListeners: 20
    });

    var predecessorId;
    var table = {};

    // rowIndex: {fingerId: , channel:}
    var ready = false;

    self.getTable = function(){
        return table;
    };

    self.getBufferedAmount = function(id) {
        var bufferSize = 0;
        Object.keys(table).some(function(k){
            if (table[k].fingerId === id && table[k].channel) {
                bufferSize = table[k].channel.bufferSize;
                return true;
            }
            return false;
        });

        return bufferSize;
    };

    self.predecessorUpdate = function(data) {
        predecessorId = data.predecessorId;
    };

    self.fingerUpdate = function(data) {
        console.log('finger-update', data);
        // 1. Check if needs to perform a new connect or just update an entry on the table
        // 2. Connect if necessary
        // 3. Once connected, update the finger tableA

        if (table[data.rowIndex] &&
                table[data.rowIndex].fingerId === data.fingerId && !table[data.rowIndex].destroyed) {
            console.log('already had establish this channel with: ', data.fingerId);
            return;
        }

        if(!table[data.rowIndex]) {
            table[data.rowIndex] = {};
        }
        if(table[data.rowIndex].channel) {
            table[data.rowIndex].channel.destroy();
        }
        table[data.rowIndex].fingerId = data.fingerId;
        table[data.rowIndex].ready = false;

        if(table[data.rowIndex].cbError){
            table[data.rowIndex].cbError();
        }
        delete table[data.rowIndex].cb;
        delete table[data.rowIndex].cbError;


        channelManager.connect(data.fingerId, function(err, channel) {
            console.log('finger table row update: ',   data.rowIndex, data.fingerId);

            if(table[data.rowIndex].fingerId !==  data.fingerId){
                console.log('Finger %s at index %d changed while connection was established, closing channel', data.fingerId, data.rowIndex);
                channel.destroy();
                return;
            }

            if(!table[data.rowIndex]) {
                table[data.rowIndex] = {};
            }
            if(table[data.rowIndex].channel) {
                table[data.rowIndex].channel.destroy();
            }
            table[data.rowIndex].fingerId = data.fingerId;
            table[data.rowIndex].channel = channel;
            table[data.rowIndex].ready = true;

            if(table[data.rowIndex].cb){
                table[data.rowIndex].cb(table[data.rowIndex].channel);
            }


            /*channel.on('close', function(){
                delete table[data.rowIndex];
            });
            */

            self.events.emit('fingerUpdate', {});
        });

    };

    self.bestCandidate = function(dstId) {
        // Identify the best candidate to send when sending to destId
        
        var responsible;
       
        dstId = new Id(dstId).toDec();

        interval(new Id(predecessorId).toDec(), peerId.toDec())
                                                .some(function(interval){
            if (isIn(interval, dstId)) {
                responsible = peerId.toHex();
                return true;
            }
        });

        if (responsible) {
            return responsible;
        }

        var lower = peerId;

        Object.keys(table).some(function(rowIndex) {
            var upper = new Id(table[rowIndex].fingerId);

            interval(lower.toDec(), upper.toDec()).some(function(interval) {
                
                if (isIn(interval, dstId)) {
                    responsible = upper.toHex();
                    return true;
                }
            });

            if (responsible) {
                return true;
            }

            lower = upper;
        });

        if (!responsible) { // if we don't know the best, send to best we can
            responsible = lower.toHex();
        }
        
        return responsible;
        
        function interval(a, b) {
            if (b < a){
                return [
                        [a, new Id(Id.spin()).toDec()],
                        [0, b]
                    ];
            } else {
                return [[a,b]];
            }
        }

        function isIn(interval, dstId) {
            if (dstId > interval[0] && dstId <= interval[1]) {
                return true;
            } else {
                return false;
            }
        }

    };

    self.channelTo = function(fingerId) {
        var channel;
        var deferred = Q.defer();
        Object.keys(table).some(function(rowIndex){
            if (table[rowIndex].fingerId === fingerId) {

                if(!table[rowIndex].ready){
                    table[rowIndex].cb = function(c){
                        deferred.resolve(c);
                    };
                    table[rowIndex].cbError = function(){
                      deferred.reject();
                    };
                } else {
                    channel = table[rowIndex].channel;

                    if (channel.destroyed) {
                        channelManager.connect(table[rowIndex].fingerId, function (err, channel) {
                            console.log('updating finger table row channel: ', rowIndex, table[rowIndex].fingerId);
                            table[rowIndex].channel = channel;

                        });
                    } else {
                        deferred.resolve(channel);
                    }
                }

                return true;
            }
        });
        return deferred.promise;
    };

    self.destroy = function(){
        Object.keys(table).forEach(function(k){
           if(table[k].channel){
               table[k].channel.destroy();
           }
        });
    };
}
