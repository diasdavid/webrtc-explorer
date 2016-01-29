(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.CA = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Node.js module for Forge.
 *
 * @author Dave Longley
 *
 * Copyright 2011-2014 Digital Bazaar, Inc.
 */
(function() {
var name = 'forge';
if(typeof define !== 'function') {
  // NodeJS -> AMD
  if(typeof module === 'object' && module.exports) {
    var nodeJS = true;
    define = function(ids, factory) {
      factory(require, module);
    };
  } else {
    // <script>
    if(typeof forge === 'undefined') {
      // set to true to disable native code if even it's available
      forge = {disableNativeCode: false};
    }
    return;
  }
}
// AMD
var deps;
var defineFunc = function(require, module) {
  module.exports = function(forge) {
    var mods = deps.map(function(dep) {
      return require(dep);
    });
    // handle circular dependencies
    forge = forge || {};
    forge.defined = forge.defined || {};
    if(forge.defined[name]) {
      return forge[name];
    }
    forge.defined[name] = true;
    for(var i = 0; i < mods.length; ++i) {
      mods[i](forge);
    }
    return forge;
  };
  // set to true to disable native code if even it's available
  module.exports.disableNativeCode = false;
  module.exports(module.exports);
};
var tmpDefine = define;
define = function(ids, factory) {
  deps = (typeof ids === 'string') ? factory.slice(2) : ids.slice(2);
  if(nodeJS) {
    delete define;
    return tmpDefine.apply(null, Array.prototype.slice.call(arguments, 0));
  }
  define = tmpDefine;
  return define.apply(null, Array.prototype.slice.call(arguments, 0));
};
define([
  'require',
  'module',
  './aes',
  './aesCipherSuites',
  './asn1',
  './cipher',
  './cipherModes',
  './debug',
  './des',
  './hmac',
  './kem',
  './log',
  './md',
  './mgf1',
  './pbkdf2',
  './pem',
  './pkcs7',
  './pkcs1',
  './pkcs12',
  './pki',
  './prime',
  './prng',
  './pss',
  './random',
  './rc2',
  './ssh',
  './task',
  './tls',
  './util'
], function() {
  defineFunc.apply(null, Array.prototype.slice.call(arguments, 0));
});
})();

},{}],2:[function(require,module,exports){

if (typeof window === 'undefined') {
    forge = require('node-forge')({disableNativeCode: true});
}



exports = module.exports = CA;


function CA(){

    var self = this;
    /** Creates a very simple self-signed certificate, used for certificate pinning
     */
    self.createSelfSignedCertificate =  function (commonname, countryname, localityname, organizationname, organizationalunit){
        console.log('Generating 2048-bit key-pair...');
        var keys = forge.pki.rsa.generateKeyPair(2048);
        console.log('Key-pair created.');


        console.log('Creating self-signed certificate...');
        var cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

        var attrs = [{
            name: 'commonName',
            value: commonname
        }, {
            name: 'countryName',
            value: countryname
        }, {
            name: 'localityName',
            value: localityname
        }, {
            name: 'organizationName',
            value: organizationname
        }, {
            shortName: 'OU',
            value: organizationalunit
        }];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.setExtensions([{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }, {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
        }, {
            name: 'nsCertType',
            client: true,
            server: true,
            sslCA: true
        }]);

        // self-sign certificate
        cert.sign(keys.privateKey/*, forge.md.sha256.create()*/);
        console.log('Certificate created.');

        // generate a p12 using AES (default)
        var p12Asn1 = forge.pkcs12.toPkcs12Asn1(
            keys.privateKey, [cert], '');
        var p12Der = forge.asn1.toDer(p12Asn1).getBytes();
        return forge.util.encode64(p12Der);
    };

    self.exportToP12 = function(privatekey, certchain, password){
        var p12Asn1 = forge.pkcs12.toPkcs12Asn1(privatekey, certchain, password);
        var p12Der = forge.asn1.toDer(p12Asn1).getBytes();
        return forge.util.encode64(p12Der);
    };
}
},{"node-forge":1}]},{},[2])(2)
});