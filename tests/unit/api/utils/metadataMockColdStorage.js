const assert = require('assert');
const metadata = require('../../metadataswitch');
const { DummyRequestLogger } = require('../../helpers');
const log = new DummyRequestLogger();
const ObjectMDAmzRestore = require('arsenal').models.ObjectMDAmzRestore;
const ObjectMDArchive = require('arsenal').models.ObjectMDArchive;
const BucketInfo = require('arsenal').models.BucketInfo;

const defaultLocation = 'location-dmf-v1';

const baseMd = {
    'owner-display-name': 'accessKey1displayName',
    'owner-id': '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be',
    'content-length': 11,
    'content-md5': 'be747eb4b75517bf6b3cf7c5fbb62f3a',
    'content-language': '',
    'x-amz-version-id': 'null',
    'x-amz-server-version-id': '',
    'x-amz-storage-class': 'STANDARD',
    'x-amz-server-side-encryption': '',
    'x-amz-server-side-encryption-aws-kms-key-id': '',
    'x-amz-server-side-encryption-customer-algorithm': '',
    'x-amz-website-redirect-location': '',
    acl: {
        Canned: 'private',
        FULL_CONTROL: [],
        WRITE_ACP: [],
        READ: [],
        READ_ACP: []
    },
    key: 'objectName',
    location: [
        {
            key: 1,
            size: 11,
            start: 0,
            dataStoreName: 'mem',
            dataStoreETag: '1:be747eb4b75517bf6b3cf7c5fbb62f3a'
        }
    ],
    isDeleteMarker: false,
    tags: {},
    replicationInfo: {
        status: '',
        backends: [],
        content: [],
        destination: '',
        storageClass: '',
        role: '',
        storageType: '',
        dataStoreVersionId: '',
        isNFS: null
    },
    dataStoreName: 'location-dmf-v1',
    originOp: 's3:ObjectCreated:Put',
    'last-modified': '2022-05-10T08:31:51.878Z',
    'md-model-version': 5,
    'x-amz-meta-test': 'some metadata'
};

/**
 * Mocks a Put Object to store custom metadata
 * @param {string} bucketName - the bucket name
 * @param {string|null} location - the bucket location
 * @param {Function} cb - callback once the bucket MD is created
 * @returns {undefined}
 */
function putBucketMock(bucketName, location, cb) {
    const bucket = new BucketInfo(
        bucketName,
        'ownerid',
        'ownerdisplayname',
        new Date().toJSON(),
        null,
        null,
        null,
        null,
        null,
        null,
        location ?? defaultLocation);
    return metadata.createBucket(bucketName, bucket, log, cb);
}

/**
 * Mocks a Put Object to store custom metadata
 * @param {string} bucketName - the bucket name
 * @param {string} objectName - the object name
 * @param {object} fields - custom MD fields to add to the object
 * @param {Function} cb - callback once the object MD is created
 * @returns {undefined}
 */
function putObjectMock(bucketName, objectName, fields, cb) {
    return metadata.putObjectMD(bucketName, objectName, {
        ...baseMd,
        ...fields,
    }, {}, log, err => {
        assert.ifError(err);
        return cb();
    });
}

/**
 * Computes the 'archive' field of the object MD as an archived object
 * @returns {ObjectMDArchive} the MD object
 */
function getArchiveArchivedMD() {
    return {
        archive: new ObjectMDArchive({}).getValue(),
    };
}

/**
 * Computes the 'archive' field of the object MD as an object being restored
 * @returns {ObjectMDArchive} the MD object
 */
function getArchiveOngoingRequestMD() {
    return {
        archive: new ObjectMDArchive({}, new Date(0), 5).getValue(),
    };
}

/**
 * Computes the 'archive' field of the object MD as a restored object from cold storage
 * @returns {ObjectMDArchive} the MD object
 */
function getArchiveRestoredMD() {
    return {
        archive: new ObjectMDArchive(
            {},
            new Date(0),
            5,
            new Date(1000),
            new Date(10000)).getValue(),
        'x-amz-restore': new ObjectMDAmzRestore(false, new Date(20000)),
    };
}

module.exports = {
    putObjectMock,
    getArchiveArchivedMD,
    getArchiveOngoingRequestMD,
    getArchiveRestoredMD,
    putBucketMock,
    defaultLocation,
};
