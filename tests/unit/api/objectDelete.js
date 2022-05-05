const assert = require('assert');
const async = require('async');
const crypto = require('crypto');
const { errors } = require('arsenal');
const xml2js = require('xml2js');

const { bucketPut } = require('../../../lib/api/bucketPut');
const bucketPutACL = require('../../../lib/api/bucketPutACL');
const constants = require('../../../constants');
const { cleanup, DummyRequestLogger, makeAuthInfo } = require('../helpers');
const objectPut = require('../../../lib/api/objectPut');
const objectDelete = require('../../../lib/api/objectDelete');
const objectGet = require('../../../lib/api/objectGet');
const initiateMultipartUpload
    = require('../../../lib/api/initiateMultipartUpload');
const objectPutPart = require('../../../lib/api/objectPutPart');
const completeMultipartUpload
    = require('../../../lib/api/completeMultipartUpload');
const DummyRequest = require('../DummyRequest');

const log = new DummyRequestLogger();
const canonicalID = 'accessKey1';
const authInfo = makeAuthInfo(canonicalID);
const namespace = 'default';
const bucketName = 'bucketname';
const postBody = Buffer.from('I am a body', 'utf8');
const objectKey = 'objectName';

function testAuth(bucketOwner, authUser, bucketPutReq, objPutReq, objDelReq,
    log, cb) {
    bucketPut(bucketOwner, bucketPutReq, log, () => {
        bucketPutACL(bucketOwner, bucketPutReq, log, err => {
            assert.strictEqual(err, undefined);
            objectPut(authUser, objPutReq, undefined, log, err => {
                assert.strictEqual(err, null);
                objectDelete(authUser, objDelReq, log, err => {
                    assert.strictEqual(err, null);
                    cb();
                });
            });
        });
    });
}

describe('objectDelete API', () => {
    let testPutObjectRequest;

    beforeEach(() => {
        cleanup();
        testPutObjectRequest = new DummyRequest({
            bucketName,
            namespace,
            objectKey,
            headers: {},
            url: `/${bucketName}/${objectKey}`,
        }, postBody);
    });

    const testBucketPutRequest = new DummyRequest({
        bucketName,
        namespace,
        headers: {},
        url: `/${bucketName}`,
    });
    const testGetObjectRequest = new DummyRequest({
        bucketName,
        namespace,
        objectKey,
        headers: {},
        url: `/${bucketName}/${objectKey}`,
    });
    const testDeleteRequest = new DummyRequest({
        bucketName,
        namespace,
        objectKey,
        headers: {},
        url: `/${bucketName}/${objectKey}`,
    });

    const initiateMPURequest = {
        bucketName,
        namespace,
        objectKey,
        headers: { host: `${bucketName}.s3.amazonaws.com` },
        url: `/${objectKey}?uploads`,
    };

    it('should delete an object', done => {
        bucketPut(authInfo, testBucketPutRequest, log, () => {
            objectPut(authInfo, testPutObjectRequest,
                undefined, log, () => {
                    objectDelete(authInfo, testDeleteRequest, log, err => {
                        assert.strictEqual(err, null);
                        objectGet(authInfo, testGetObjectRequest, false,
                            log, err => {
                                assert.strictEqual(err.is.NoSuchKey, true);
                                done();
                            });
                    });
                });
        });
    });

    it('should delete a 0 bytes object', done => {
        const testPutObjectRequest = new DummyRequest({
            bucketName,
            namespace,
            objectKey,
            headers: {},
            url: `/${bucketName}/${objectKey}`,
        }, '');
        bucketPut(authInfo, testBucketPutRequest, log, () => {
            objectPut(authInfo, testPutObjectRequest,
                undefined, log, () => {
                    objectDelete(authInfo, testDeleteRequest, log, err => {
                        assert.strictEqual(err, null);
                        objectGet(authInfo, testGetObjectRequest, false,
                            log, err => {
                                const expected =
                                    Object.assign({}, errors.NoSuchKey);
                                const received = Object.assign({}, err);
                                assert.deepStrictEqual(received, expected);
                                done();
                            });
                    });
                });
        });
    });

    it('should delete a multipart upload', done => {
        const partBody = Buffer.from('I am a part\n', 'utf8');
        let testUploadId;
        let calculatedHash;
        async.waterfall([
            next => bucketPut(authInfo, testBucketPutRequest, log, next),
            (corsHeaders, next) => initiateMultipartUpload(authInfo,
                initiateMPURequest, log, next),
            (result, corsHeaders, next) => xml2js.parseString(result, next),
            (json, next) => {
                testUploadId = json.InitiateMultipartUploadResult.UploadId[0];
                const md5Hash = crypto.createHash('md5').update(partBody);
                calculatedHash = md5Hash.digest('hex');
                const partRequest = new DummyRequest({
                    bucketName,
                    namespace,
                    objectKey,
                    headers: { host: `${bucketName}.s3.amazonaws.com` },
                    url: `/${objectKey}?partNumber=1&uploadId=${testUploadId}`,
                    query: {
                        partNumber: '1',
                        uploadId: testUploadId,
                    },
                    calculatedHash,
                }, partBody);
                objectPutPart(authInfo, partRequest, undefined, log, next);
            },
            (hexDigest, corsHeaders, next) => {
                const completeBody = '<CompleteMultipartUpload>' +
                      '<Part>' +
                      '<PartNumber>1</PartNumber>' +
                      `<ETag>"${calculatedHash}"</ETag>` +
                      '</Part>' +
                      '</CompleteMultipartUpload>';
                const completeRequest = {
                    bucketName,
                    namespace,
                    objectKey,
                    parsedHost: 's3.amazonaws.com',
                    url: `/${objectKey}?uploadId=${testUploadId}`,
                    headers: { host: `${bucketName}.s3.amazonaws.com` },
                    query: { uploadId: testUploadId },
                    post: completeBody,
                };
                completeMultipartUpload(authInfo, completeRequest, log, next);
            },
            (result, resHeaders, next) =>
                objectDelete(authInfo, testDeleteRequest, log, next),
        ], done);
    });

    it('should prevent anonymous user deleteObject API access', done => {
        const publicAuthInfo = makeAuthInfo(constants.publicId);
        bucketPut(authInfo, testBucketPutRequest, log, () => {
            objectDelete(publicAuthInfo, testDeleteRequest, log, err => {
                assert.strictEqual(err.is.AccessDenied, true);
                done();
            });
        });
    });

    it('should del object if user has FULL_CONTROL grant on bucket', done => {
        const bucketOwner = makeAuthInfo('accessKey2');
        const authUser = makeAuthInfo('accessKey3');
        testBucketPutRequest.headers['x-amz-grant-full-control'] =
            `id=${authUser.getCanonicalID()}`;
        testAuth(bucketOwner, authUser, testBucketPutRequest,
            testPutObjectRequest, testDeleteRequest, log, done);
    });

    it('should del object if user has WRITE grant on bucket', done => {
        const bucketOwner = makeAuthInfo('accessKey2');
        const authUser = makeAuthInfo('accessKey3');
        testBucketPutRequest.headers['x-amz-grant-write'] =
            `id=${authUser.getCanonicalID()}`;
        testAuth(bucketOwner, authUser, testBucketPutRequest,
            testPutObjectRequest, testDeleteRequest, log, done);
    });

    it('should del object in bucket with public-read-write acl', done => {
        const bucketOwner = makeAuthInfo('accessKey2');
        const authUser = makeAuthInfo('accessKey3');
        testBucketPutRequest.headers['x-amz-acl'] = 'public-read-write';
        testAuth(bucketOwner, authUser, testBucketPutRequest,
            testPutObjectRequest, testDeleteRequest, log, done);
    });
});
