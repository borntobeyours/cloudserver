const assert = require('assert');
const moment = require('moment');

const { bucketPut } = require('../../../lib/api/bucketPut');
const objectPut = require('../../../lib/api/objectPut');
const objectPutRetention = require('../../../lib/api/objectPutRetention');
const { cleanup, DummyRequestLogger, makeAuthInfo } = require('../helpers');
const metadata = require('../../../lib/metadata/wrapper');
const DummyRequest = require('../DummyRequest');

const log = new DummyRequestLogger();
const authInfo = makeAuthInfo('accessKey1');
const namespace = 'default';
const bucketName = 'bucketname';
const objectName = 'objectName';
const postBody = Buffer.from('I am a body', 'utf8');

const date = new Date();
date.setDate(date.getDate() + 1);

const bucketPutRequest = {
    bucketName,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    url: '/',
};

const putObjectRequest = new DummyRequest({
    bucketName,
    namespace,
    objectKey: objectName,
    headers: {},
    url: `/${bucketName}/${objectName}`,
}, postBody);

const objectRetentionXmlGovernance = '<Retention ' +
    'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Mode>GOVERNANCE</Mode>' +
    `<RetainUntilDate>${date.toISOString()}</RetainUntilDate>` +
    '</Retention>';

const objectRetentionXmlCompliance = '<Retention ' +
    'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Mode>COMPLIANCE</Mode>' +
    `<RetainUntilDate>${moment().add(2, 'days').toISOString()}</RetainUntilDate>` +
    '</Retention>';

const objectRetentionXmlComplianceShorter = '<Retention ' +
    'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Mode>COMPLIANCE</Mode>' +
    `<RetainUntilDate>${moment().add(1, 'days').toISOString()}</RetainUntilDate>` +
    '</Retention>';

const putObjRetRequestGovernance = {
    bucketName,
    objectKey: objectName,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    post: objectRetentionXmlGovernance,
};

const putObjRetRequestGovernanceWithHeader = {
    bucketName,
    objectKey: objectName,
    headers: {
        'host': `${bucketName}.s3.amazonaws.com`,
        'x-amz-bypass-governance-retention': 'true',
    },
    post: objectRetentionXmlGovernance,
};

const putObjRetRequestCompliance = {
    bucketName,
    objectKey: objectName,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    post: objectRetentionXmlCompliance,
};

const putObjRetRequestComplianceShorter = {
    bucketName,
    objectKey: objectName,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    post: objectRetentionXmlComplianceShorter,
};

const expectedMode = 'GOVERNANCE';
const expectedDate = date.toISOString();

describe('putObjectRetention API', () => {
    before(() => cleanup());

    describe('without Object Lock enabled on bucket', () => {
        beforeEach(done => {
            bucketPut(authInfo, bucketPutRequest, log, err => {
                assert.ifError(err);
                objectPut(authInfo, putObjectRequest, undefined, log, done);
            });
        });
        afterEach(() => cleanup());

        it('should return InvalidRequest error', done => {
            objectPutRetention(authInfo, putObjRetRequestGovernance, log, err => {
                assert.strictEqual(err.is.InvalidRequest, true);
                done();
            });
        });
    });

    describe('with Object Lock enabled on bucket', () => {
        const bucketObjLockRequest = Object.assign({}, bucketPutRequest,
            { headers: { 'x-amz-bucket-object-lock-enabled': 'true' } });

        beforeEach(done => {
            bucketPut(authInfo, bucketObjLockRequest, log, err => {
                assert.ifError(err);
                objectPut(authInfo, putObjectRequest, undefined, log, done);
            });
        });
        afterEach(() => cleanup());

        it('should update an object\'s metadata with retention info', done => {
            objectPutRetention(authInfo, putObjRetRequestGovernance, log, err => {
                assert.ifError(err);
                return metadata.getObjectMD(bucketName, objectName, {}, log,
                (err, objMD) => {
                    assert.ifError(err);
                    assert.strictEqual(objMD.retentionMode, expectedMode);
                    assert.strictEqual(objMD.retentionDate, expectedDate);
                    return done();
                });
            });
        });

        it('should disallow COMPLIANCE => GOVERNANCE', done => {
            objectPutRetention(authInfo, putObjRetRequestCompliance, log, err => {
                assert.ifError(err);
                return objectPutRetention(authInfo, putObjRetRequestGovernance, log, err => {
                    assert.strictEqual(err.is.AccessDenied, true);
                    done();
                });
            });
        });

        it('should disallow shortening of COMPLIANCE retention', done => {
            objectPutRetention(authInfo, putObjRetRequestCompliance, log, err => {
                assert.ifError(err);
                return objectPutRetention(authInfo, putObjRetRequestComplianceShorter, log, err => {
                    assert.strictEqual(err.is.AccessDenied, true);
                    done();
                });
            });
        });

        it('should disallow update if the x-amz-bypass-governance-retention header is missing and'
            + 'GOVERNANCE mode is enabled', done => {
            objectPutRetention(authInfo, putObjRetRequestGovernance, log, err => {
                assert.ifError(err);
                return objectPutRetention(authInfo, putObjRetRequestGovernance, log, err => {
                    assert.strictEqual(err.is.AccessDenied, true);
                    done();
                });
            });
        });


        it('should allow update if the x-amz-bypass-governance-retention header is present and'
            + 'GOVERNANCE mode is enabled', done => {
            objectPutRetention(authInfo, putObjRetRequestGovernance, log, err => {
                assert.ifError(err);
                return objectPutRetention(authInfo, putObjRetRequestGovernanceWithHeader, log, err => {
                    assert.ifError(err);
                    done();
                });
            });
        });
    });
});
