const request = require('supertest');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const walletRoutes = require('../routes/wallet');
const { db } = require('../database');

jest.mock('../database', () => ({
    db: {
        run: jest.fn((query, params, callback) => {
            if (typeof params === 'function') {
                params(null);
            } else if (callback) {
                callback(null);
            }
        }),
        get: jest.fn((query, params, callback) => {
            if (typeof params === 'function') {
                params(null, null);
            } else if (callback) {
                callback(null, { balance: '100.00' });
            }
        }),
        all: jest.fn((query, callback) => callback(null, [])),
        serialize: jest.fn(cb => cb())
    }
}));

const app = express();
app.use(express.json());
app.use('/api/wallet', walletRoutes);

const authToken = 'valid-token'; // Replace with actual token

describe('Wallet API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /account', () => {
        it('should create new account with zero balance', async () => {
            const { db } = require('../database');
            db.run.mockImplementation((query, params, callback) => callback(null));

            const response = await request(app)
                .post('/api/wallet/account')
                .set('Authorization', authToken);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('userId');
            expect(response.body.balance).toBe('0.00');
        });

        it('should handle database errors gracefully', async () => {
            const { db } = require('../database');
            db.run.mockImplementation((query, params, callback) =>
                callback(new Error('Database error')));

            const response = await request(app)
                .post('/api/wallet/account')
                .set('Authorization', authToken);

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to create account');
        });
    });

    describe('GET /users', () => {
        it('should return all users with formatted balances', async () => {
            const { db } = require('../database');
            const mockUsers = [
                { id: uuidv4(), balance: '100.5', created_at: new Date().toISOString() },
                { id: uuidv4(), balance: '200', created_at: new Date().toISOString() }
            ];

            db.all.mockImplementation((query, callback) => callback(null, mockUsers));

            const response = await request(app)
                .get('/api/wallet/users')
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body[0].balance).toBe('100.50');
            expect(response.body[1].balance).toBe('200.00');
        });

        it('should handle database errors', async () => {
            const { db } = require('../database');
            db.all.mockImplementation((query, callback) =>
                callback(new Error('Database error')));

            const response = await request(app)
                .get('/api/wallet/users')
                .set('Authorization', authToken);

            expect(response.status).toBe(500);
        });
    });

    describe('GET /users/:userId/balance', () => {
        it('should return user balance', async () => {
            const userId = uuidv4();
            const { db } = require('../database');
            db.get.mockImplementation((query, params, callback) =>
                callback(null, { balance: '100.00' }));

            const response = await request(app)
                .get(`/api/wallet/users/${userId}/balance`)
                .set('Authorization', authToken);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                userId,
                balance: '100.00'
            });
        });

        it('should return 404 for non-existent user', async () => {
            const { db } = require('../database');
            db.get.mockImplementation((query, params, callback) =>
                callback(null, null));

            const response = await request(app)
                .get(`/api/wallet/users/${uuidv4()}/balance`)
                .set('Authorization', authToken);

            expect(response.status).toBe(404);
        });

        it('should validate userId format', async () => {
            const response = await request(app)
                .get('/api/wallet/users/invalid-uuid/balance')
                .set('Authorization', authToken);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid user ID format');
        });
    });

    describe('POST /topup', () => {
        it('should add funds to user account', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            // Mock db.serialize to execute callback immediately
            db.serialize.mockImplementation(cb => cb());

            // Setup mocks for the transaction sequence
            db.get
                .mockImplementationOnce((query, params, callback) => callback(null, null))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { balance: '100.00' }));

            db.run.mockImplementation((query, params, callback) => {
                if (callback) callback(null);
            });

            const response = await request(app)
                .post('/api/wallet/topup')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('transactionId');
            expect(response.body.newBalance).toBe('150.00');
        });

        it('should handle decimal amounts correctly', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            db.serialize.mockImplementation(cb => cb());
            db.get
                .mockImplementationOnce((query, params, callback) => callback(null, null))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { balance: '100.50' }));

            db.run.mockImplementation((query, params, callback) => {
                if (callback) callback(null);
            });

            const response = await request(app)
                .post('/api/wallet/topup')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '49.99'
                });

            expect(response.status).toBe(200);
            expect(response.body.newBalance).toBe('150.49');
        });

        it('should reject invalid amount formats', async () => {
            const invalidAmounts = ['-50.00', '0.00', 'abc'];
            const userId = uuidv4();

            for (const amount of invalidAmounts) {
                const response = await request(app)
                    .post('/api/wallet/topup')
                    .set('Authorization', authToken)
                    .send({
                        userId,
                        amount
                    });

                expect(response.status).toBe(400);
                expect(response.body.error).toMatch(/Invalid amount format/);
            }
        });

        it('should handle duplicate transactions', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            db.serialize.mockImplementation(cb => cb());
            db.get
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { id: 'existing-tx' }));

            const response = await request(app)
                .post('/api/wallet/topup')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('Duplicate transaction');
        });

        it('should prevent duplicate transactions', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            db.serialize.mockImplementation(cb => cb());
            db.get
                .mockImplementationOnce((query, params, callback) => callback(null, null))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { balance: '100.00' }))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { id: 'existing-tx' }));

            db.run.mockImplementation((query, params, callback) => {
                if (callback) callback(null);
            });

            const response1 = await request(app)
                .post('/api/wallet/topup')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '50.00'
                });

            const response2 = await request(app)
                .post('/api/wallet/topup')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '51.00'
                });

            // console.log('t1: ' , response1.body);
            expect(response1.status).toBe(200);
            // console.log('t2: ' , response2.body);
            expect(response1.body).toHaveProperty('transactionId');
            expect(response1.body.newBalance).toBe('150.00');
            expect(response2.status).toBe(409);
            expect(response2.body.error).toBe('Duplicate transaction');
        });
    });

    describe('POST /charge', () => {
        it('should deduct funds from user account', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            db.serialize.mockImplementation(cb => cb());
            db.get
                .mockImplementationOnce((query, params, callback) => callback(null, null))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { balance: '100.00' }));

            db.run.mockImplementation((query, params, callback) => {
                if (callback) callback(null);
                else if (typeof params === 'function') params(null);
            });

            const response = await request(app)
                .post('/api/wallet/charge')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(200);
            expect(response.body.newBalance).toBe('50.00');
        }, 10000);

        it('should handle exact balance charges', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            db.serialize.mockImplementation(cb => cb());
            db.get
                .mockImplementationOnce((query, params, callback) => callback(null, null))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { balance: '50.00' }));

            db.run.mockImplementation((query, params, callback) => {
                if (callback) callback(null);
                else if (typeof params === 'function') params(null);
            });

            const response = await request(app)
                .post('/api/wallet/charge')
                .set('Authorization', authToken)
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(200);
            expect(response.body.newBalance).toBe('0.00');
        }, 10000);

    });

    describe('POST /topup', () => {
        it('should handle concurrent topups correctly', async () => {
            const userId = '112f224a-8596-419d-95ad-8b1bd453fe45';

            const port = process.env.PORT || 3000;

            const topupRequest = {
                userId,
                amount: '50.00'
            };


            const userBalance = await request(`http://localhost:${port}`).get(`/api/wallet/users/${userId}`).set('Authorization', authToken);
            console.log('current balance : ', userBalance.body.balance);

            await Promise.all([
                request(`http://localhost:${port}`).post('/api/wallet/topup').set('Authorization', authToken).send(topupRequest),
                request(`http://localhost:${port}`).post('/api/wallet/topup').set('Authorization', authToken).send(topupRequest)
            ]);

            const userNewBalance = await request(`http://localhost:${port}`).get(`/api/wallet/users/${userId}`).set('Authorization', authToken);

            expect(userNewBalance.status).toBe(200);
            expect(userNewBalance.body.balance).toBe((+userBalance.body.balance + 100).toFixed(2));

            const chargeRequest = {
                userId,
                amount: '100.00'
            };

            await Promise.all([
                request(`http://localhost:${port}`).post('/api/wallet/charge').set('Authorization', authToken).send(chargeRequest),
                request(`http://localhost:${port}`).post('/api/wallet/charge').set('Authorization', authToken).send(chargeRequest)
            ]);


        });
    });

});