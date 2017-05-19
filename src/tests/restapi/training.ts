/*eslint-env mocha */
import * as uuid from 'uuid/v1';
import * as assert from 'assert';
import * as request from 'supertest-as-promised';
import * as httpstatus from 'http-status';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

import * as store from '../../lib/db/store';
import * as auth from '../../lib/restapi/auth';
import testapiserver from './testserver';



let testServer;


describe('REST API - training', () => {

    let authStub;
    let checkUserStub;
    let requireSupervisorStub;

    function authNoOp(req, res, next) { next(); }


    before(async () => {
        authStub = sinon.stub(auth, 'authenticate').callsFake(authNoOp);
        checkUserStub = sinon.stub(auth, 'checkValidUser').callsFake(authNoOp);
        requireSupervisorStub = sinon.stub(auth, 'requireSupervisor').callsFake(authNoOp);
        proxyquire('../../lib/restapi/users', {
            './auth' : {
                authenticate : authStub,
                checkValidUser : checkUserStub,
                requireSupervisor : requireSupervisorStub,
            },
        });

        await store.init();

        testServer = testapiserver();
    });


    after(() => {
        authStub.restore();
        checkUserStub.restore();
        requireSupervisorStub.restore();

        return store.disconnect();
    });


    describe('getLabels()', () => {

        it('should verify project exists', () => {
            const classid = uuid();
            const studentid = uuid();
            const projectid = uuid();
            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + studentid + '/projects/' + projectid + '/labels')
                .expect('Content-Type', /json/)
                .expect(httpstatus.NOT_FOUND)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.error, 'Not found');
                });
        });


        it('should fetch empty training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'images', 'demo');
            const projectid = project.id;

            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + userid + '/projects/' + projectid + '/labels')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.deepEqual(body, []);

                    return store.deleteProject(projectid);
                });
        });


        it('should verify user id', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            return request(testServer)
                .get('/api/classes/' + classid + '/students/DIFFERENTUSER/projects/' + projectid + '/labels')
                .expect('Content-Type', /json/)
                .expect(httpstatus.FORBIDDEN)
                .then(() => {
                    return store.deleteProject(projectid);
                });
        });


        it('should get training labels', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            await store.storeTextTraining(projectid, 'apple', 'fruit');
            await store.storeTextTraining(projectid, 'banana', 'fruit');
            await store.storeTextTraining(projectid, 'tomato', 'vegetable');
            await store.storeTextTraining(projectid, 'cabbage', 'vegetable');
            await store.storeTextTraining(projectid, 'potato', 'vegetable');
            await store.storeTextTraining(projectid, 'beef', 'meat');

            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + userid + '/projects/' + projectid + '/labels')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then(async (res) => {
                    const body = res.body;
                    assert.deepEqual(body, {
                        fruit : 2, vegetable : 3, meat : 1,
                    });

                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        });
    });


    describe('storeTraining()', () => {

        it('should verify project exists', () => {
            const classid = uuid();
            const studentid = uuid();
            const projectid = uuid();
            return request(testServer)
                .post('/api/classes/' + classid + '/students/' + studentid + '/projects/' + projectid + '/training')
                .expect('Content-Type', /json/)
                .expect(httpstatus.NOT_FOUND)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.error, 'Not found');
                });
        });

        it('should verify user id', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            return request(testServer)
                .post('/api/classes/' + classid + '/students/DIFFERENTUSER/projects/' + projectid + '/training')
                .expect('Content-Type', /json/)
                .expect(httpstatus.FORBIDDEN)
                .then(() => {
                    return store.deleteProject(projectid);
                });
        });


        it('should require data in training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            const trainingurl = '/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training';

            return request(testServer)
                .post(trainingurl)
                .send({
                    label : 'nothing-to-label',
                })
                .expect('Content-Type', /json/)
                .expect(httpstatus.BAD_REQUEST)
                .then(async (res) => {
                    const body = res.body;
                    assert.deepEqual(body, { error : 'Missing data' });

                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        });


        it('should store numeric training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'numbers', 'demo');
            const projectid = project.id;

            const trainingurl = '/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training';

            return request(testServer)
                .post(trainingurl)
                .send({
                    data : 'apple',
                    label : 'fruit',
                })
                .expect(httpstatus.NOT_IMPLEMENTED)
                .then(async () => {
                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        });


        it('should store non-text training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'images', 'demo');
            const projectid = project.id;

            const trainingurl = '/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training';

            return request(testServer)
                .post(trainingurl)
                .send({
                    data : 'apple',
                    label : 'fruit',
                })
                .expect(httpstatus.NOT_IMPLEMENTED)
                .then(async () => {
                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        });


        it('should store training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            const trainingurl = '/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training';

            return request(testServer)
                .post(trainingurl)
                .send({
                    data : 'apple',
                    label : 'fruit',
                })
                .expect('Content-Type', /json/)
                .expect(httpstatus.CREATED)
                .then(() => {
                    return request(testServer)
                        .get(trainingurl)
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.OK);
                })
                .then(async (res) => {
                    const body = res.body;
                    assert.equal(body.length, 1);
                    assert.equal(res.header['content-range'], 'items 0-0/1');

                    assert.equal(body[0].textdata, 'apple');
                    assert.equal(body[0].label, 'fruit');

                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        }).timeout(10000);
    });



    describe('editLabel()', () => {

        it('should edit training label', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            const projecturl = '/api/classes/' + classid +
                               '/students/' + userid +
                               '/projects/' + projectid;

            return request(testServer)
                .post(projecturl + '/training')
                .send({
                    data : 'apple',
                    label : 'fruit',
                })
                .expect('Content-Type', /json/)
                .expect(httpstatus.CREATED)
                .then(() => {
                    return request(testServer)
                        .put(projecturl + '/labels')
                        .send({
                            before : 'fruit',
                            after : 'healthy',
                        })
                        .expect(httpstatus.OK);
                })
                .then(() => {
                    return request(testServer)
                        .get(projecturl + '/training')
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.OK);
                })
                .then(async (res) => {
                    const body = res.body;
                    assert.equal(body.length, 1);
                    assert.equal(res.header['content-range'], 'items 0-0/1');

                    assert.equal(body[0].textdata, 'apple');
                    assert.equal(body[0].label, 'healthy');

                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        }).timeout(10000);

    });



    describe('getTraining()', () => {

        it('should verify project exists', () => {
            const classid = uuid();
            const studentid = uuid();
            const projectid = uuid();
            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + studentid + '/projects/' + projectid + '/training')
                .expect('Content-Type', /json/)
                .expect(httpstatus.NOT_FOUND)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.error, 'Not found');
                });
        });


        it('should fetch empty training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'images', 'demo');
            const projectid = project.id;

            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + userid + '/projects/' + projectid + '/training')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.deepEqual(body, []);

                    return store.deleteProject(projectid);
                });
        });


        it('should verify user id', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            return request(testServer)
                .get('/api/classes/' + classid + '/students/DIFFERENTUSER/projects/' + projectid + '/training')
                .expect('Content-Type', /json/)
                .expect(httpstatus.FORBIDDEN)
                .then(() => {
                    return store.deleteProject(projectid);
                });
        });


        it('should get training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            const data = [];

            for (let labelIdx = 0; labelIdx < 2; labelIdx++) {
                const label = uuid();

                for (let text = 0; text < 3; text++) {
                    const textdata = uuid();

                    data.push({ textdata, label });
                }
            }

            await store.bulkStoreTextTraining(projectid, data);

            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + userid + '/projects/' + projectid + '/training')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then(async (res) => {
                    const body = res.body;
                    assert.equal(body.length, 6);

                    body.forEach((item) => {
                        assert(item.id);
                        assert(item.label);
                        assert(item.textdata);
                    });

                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        });


        it('should get a page of training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            const data = [];

            for (let labelIdx = 0; labelIdx < 4; labelIdx++) {
                const label = uuid();

                for (let text = 0; text < 5; text++) {
                    const textdata = uuid();

                    data.push({ textdata, label });
                }
            }

            await store.bulkStoreTextTraining(projectid, data);

            return request(testServer)
                .get('/api/classes/' + classid + '/students/' + userid + '/projects/' + projectid + '/training')
                .set('Range', 'items=0-9')
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then(async (res) => {
                    const body = res.body;
                    assert.equal(body.length, 10);

                    body.forEach((item) => {
                        assert(item.id);
                        assert(item.label);
                        assert(item.textdata);
                    });

                    assert.equal(res.header['content-range'], 'items 0-9/20');

                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        }).timeout(10000);
    });


    describe('deleteTraining()', () => {

        it('should verify permissions', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            const apple = await store.storeTextTraining(projectid, 'apple', 'fruit');
            const banana = await store.storeTextTraining(projectid, 'banana', 'fruit');

            const trainingurl = '/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training';

            return request(testServer)
                .get(trainingurl)
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.length, 2);
                    assert.equal(res.header['content-range'], 'items 0-1/2');

                    return request(testServer)
                        .delete('/api/classes/' + classid +
                                '/students/' + 'differentuserid' +
                                '/projects/' + projectid +
                                '/training/' + apple.id)
                        .expect(httpstatus.FORBIDDEN);
                })
                .then(() => {
                    return request(testServer)
                        .delete('/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + 'differentprojectid' +
                                '/training/' + banana.id)
                        .expect(httpstatus.NOT_FOUND);
                })
                .then(() => {
                    return request(testServer)
                        .get(trainingurl)
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.OK)
                        .then((res) => {
                            const body = res.body;
                            assert.equal(body.length, 2);
                            assert.equal(res.header['content-range'], 'items 0-1/2');
                        });
                })
                .then(() => {
                    return request(testServer)
                        .delete('/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training/' + banana.id)
                        .expect(httpstatus.NO_CONTENT);
                })
                .then(() => {
                    return request(testServer)
                        .get(trainingurl)
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.OK)
                        .then((res) => {
                            const body = res.body;
                            assert.equal(body.length, 1);
                            assert.equal(res.header['content-range'], 'items 0-0/1');
                        });
                })
                .then(async () => {
                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        }).timeout(10000);


        it('should delete training', async () => {
            const classid = uuid();
            const userid = uuid();

            const project = await store.storeProject(userid, classid, 'text', 'demo');
            const projectid = project.id;

            await store.storeTextTraining(projectid, 'apple', 'fruit');
            await store.storeTextTraining(projectid, 'banana', 'fruit');

            const trainingurl = '/api/classes/' + classid +
                                '/students/' + userid +
                                '/projects/' + projectid +
                                '/training';

            return request(testServer)
                .get(trainingurl)
                .expect('Content-Type', /json/)
                .expect(httpstatus.OK)
                .then((res) => {
                    const body = res.body;
                    assert.equal(body.length, 2);
                    assert.equal(res.header['content-range'], 'items 0-1/2');

                    return request(testServer)
                        .delete(trainingurl + '/' + body[0].id)
                        .expect(httpstatus.NO_CONTENT);
                })
                .then(() => {
                    return request(testServer)
                        .get(trainingurl)
                        .expect('Content-Type', /json/)
                        .expect(httpstatus.OK)
                        .then((res) => {
                            const body = res.body;
                            assert.equal(body.length, 1);
                            assert.equal(res.header['content-range'], 'items 0-0/1');
                        });
                })
                .then(async () => {
                    await store.deleteProject(projectid);
                    await store.deleteTextTrainingByProjectId(projectid);
                });
        }).timeout(10000);

    });

});
