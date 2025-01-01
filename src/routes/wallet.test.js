const request = require('supertest');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const walletRoutes = require('../routes/wallet');

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

describe('Wallet API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /account', () => {
        it('should create new account with zero balance', async () => {
            const { db } = require('../database');
            db.run.mockImplementation((query, params, callback) => callback(null));

            const response = await request(app)
                .post('/api/wallet/account');

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('userId');
            expect(response.body.balance).toBe('0.00');
        });

        it('should handle database errors gracefully', async () => {
            const { db } = require('../database');
            db.run.mockImplementation((query, params, callback) =>
                callback(new Error('Database error')));

            const response = await request(app)
                .post('/api/wallet/account');

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
                .get('/api/wallet/users');

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
                .get('/api/wallet/users');

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
                .get(`/api/wallet/users/${userId}/balance`);

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
                .get(`/api/wallet/users/${uuidv4()}/balance`);

            expect(response.status).toBe(404);
        });

        it('should validate userId format', async () => {
            const response = await request(app)
                .get('/api/wallet/users/invalid-uuid/balance');

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
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('Duplicate transaction');
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
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(200);
            expect(response.body.newBalance).toBe('50.00');
        }, 10000);

        it('should handle transaction failures', async () => {
            const userId = uuidv4();
            const { db } = require('../database');

            db.serialize.mockImplementation(cb => cb());
            db.get
                .mockImplementationOnce((query, params, callback) => callback(null, null))
                .mockImplementationOnce((query, params, callback) =>
                    callback(null, { balance: '100.00' }));

            let transactionStep = 0;
            db.run.mockImplementation((query, params, callback) => {
                transactionStep++;
                if (transactionStep === 3) {
                    if (callback) callback(new Error('Transaction failed'));
                    else if (typeof params === 'function') params(new Error('Transaction failed'));
                    return;
                }
                if (callback) callback(null);
                else if (typeof params === 'function') params(null);
            });

            const response = await request(app)
                .post('/api/wallet/charge')
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Transaction failed');
        });

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
                .send({
                    userId,
                    amount: '50.00'
                });

            expect(response.status).toBe(200);
            expect(response.body.newBalance).toBe('0.00');
        }, 10000);
    });
});