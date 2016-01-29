/**
 * Created by areiter on 8/5/15.
 */
var stunturncheck = require('stunturncheck');

stunturncheck({urls: "turn:numb.viagenie.ca", credential: "webrtcdemo", username: "louis%40mozilla.com"}, function(err, res) {
    if (err) {
        // some kind of error occurred
        return;
    }
    if (res > 0) {
        // a stun server could be reached and the local description
        // contains srflx (for stun) or relay (for turn) candidates.
    } else {

        // stun server could not be reached, port may be blocked.
    }
});