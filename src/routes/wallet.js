const express = require('express');
const { v4: uuidv4, v5: uuidv5, validate: validateUUID } = require('uuid');
const { Decimal } = require('decimal.js');
const { db } = require('../database');
const guardMiddleware = require('../middleware/guard');

const router = express.Router();

// Middleware for request validation
const validateAmount = (req, res, next) => {
    if (!req.body.amount) {
        return res.status(400).json({ error: 'Invalid amount format' });
    }

    try {
        const amount = new Decimal(req.body.amount);
        if (amount.isNaN() || amount.lte(0) || amount.decimalPlaces() > 2) {
            return res.status(400).json({ error: 'Invalid amount format. Must be positive with max 2 decimal places.' });
        }
        req.validatedAmount = amount.toFixed(2);
        next();
    } catch (e) {
        return res.status(400).json({ error: 'Invalid amount format' });
    }
};

const validateUserId = (req, res, next) => {
    const userId = req.params.userId || req.body.userId;
    if (!userId || !validateUUID(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
    }
    next();
};

// Apply guard middleware to all routes
router.use(guardMiddleware);

// Create account
router.post('/account', (req, res) => {
    const userId = uuidv4();

    db.run('INSERT INTO users (id, balance) VALUES (?, ?)', [userId, '0.00'], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to create account' });
        res.status(201).json({ userId, balance: '0.00' });
    });
});

// Get all users
router.get('/users', (req, res) => {
    db.all('SELECT id, balance, created_at FROM users', (err, users) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch users' });
        res.json(users.map(user => ({
            ...user,
            balance: Number(user.balance).toFixed(2)
        })));
    });
});

// Get user details and balance
router.get('/users/:userId', validateUserId, (req, res) => {
    const { userId } = req.params;

    db.get('SELECT id, balance, created_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json({
            ...user,
            balance: Number(user.balance).toFixed(2)
        });
    });
});


// Get balance
router.get('/users/:userId/balance', validateUserId, (req, res) => {
    const { userId } = req.params;

    db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json({ userId, balance: Number(user.balance).toFixed(2) });
    });
});

// Top-up with auto-generated idempotency
router.post('/topup', validateAmount, validateUserId, (req, res) => {
    const { userId } = req.body;
    const amount = req.validatedAmount;
    const idempotencyKey = uuidv5(`${userId}-${amount}-${Date.now()}`, uuidv4());

    db.serialize(() => {
        //db.run('BEGIN TRANSACTION');

        db.get('SELECT id FROM transactions WHERE idempotency_key = ?', [idempotencyKey], (err, existingTx) => {
            if (existingTx) {
                //db.run('ROLLBACK');
                return res.status(409).json({ error: 'Duplicate transaction' });
            }

            db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {

                if (err || !user) {
                    //db.run('ROLLBACK');
                    return res.status(404).json({ error: 'User not found' });
                }


                const txId = uuidv4();
                const newBalance = new Decimal(user.balance).plus(amount).toFixed(2);

                db.run(
                    'INSERT INTO transactions (id, user_id, idempotency_key, type, amount) VALUES (?, ?, ?, ?, ?)',
                    [txId, userId, idempotencyKey, 'topup', amount],
                    (err) => {
                        if (err) {
                            //db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Transaction failed' });
                        }

                        db.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId], (err) => {
                            if (err) {
                                //db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction failed' });
                            }

                            console.log('creating topup transaction', idempotencyKey);

                            ////db.run('COMMIT');
                            res.json({ userId, transactionId: txId, newBalance });
                        });
                    }
                );
            });
        });
    });
});

// Charge with auto-generated idempotency
router.post('/charge', validateAmount, validateUserId, (req, res) => {
    const { userId } = req.body;
    const amount = req.validatedAmount;
    const idempotencyKey = uuidv5(`${userId}-${amount}-${Date.now()}`, uuidv4());

    db.serialize(() => {
        //db.run('BEGIN TRANSACTION');

        db.get('SELECT id FROM transactions WHERE idempotency_key = ?', [idempotencyKey], (err, existingTx) => {
            if (existingTx) {
                //db.run('ROLLBACK');
                return res.status(409).json({ error: 'Duplicate transaction' });
            }

            db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, user) => {
                if (err || !user) {
                    //db.run('ROLLBACK');
                    return res.status(404).json({ error: 'User not found' });
                }

                const newBalance = new Decimal(user.balance).minus(amount);
                if (newBalance.isNegative()) {
                    //db.run('ROLLBACK');
                    return res.status(400).json({ error: 'Insufficient balance' });
                }

                const txId = uuidv4();

                db.run(
                    'INSERT INTO transactions (id, user_id, idempotency_key, type, amount) VALUES (?, ?, ?, ?, ?)',
                    [txId, userId, idempotencyKey, 'charge', amount],
                    (err) => {
                        if (err) {
                            //db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Transaction failed' });
                        }


                        db.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance.toFixed(2), userId], (err) => {
                            if (err) {
                                //db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Transaction failed' });
                            }

                            // db.run('COMMIT', (err) => {
                            //     if (err) {
                            //         //db.run('ROLLBACK');
                            //         return res.status(500).json({ error: 'Transaction failed' });
                            //     }
                            //   });

                            console.log('creating charge transaction', idempotencyKey);

                            res.json({ userId, transactionId: txId, newBalance: newBalance.toFixed(2) });
                        });
                    }
                );
            });
        });
    });
});

module.exports = router;