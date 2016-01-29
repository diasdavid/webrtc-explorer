
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