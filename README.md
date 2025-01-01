# Wallet API

A Node.js Express API for managing digital wallets with SQLite backend.

## Features

- Create user wallets
- Top up balance
- Charge/deduct funds
- View balances and transactions
- Idempotent transactions
- Decimal precision handling
- Transaction rollback support

## Installation

```bash
npm install
```

## Running the API

```bash
# Development mode
npm run dev

# Production mode
npm start

# Run tests
npm test
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Transactions Table

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  idempotency_key TEXT UNIQUE,
  type TEXT,
  amount DECIMAL(10,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

## API Endpoints

All endpoints are prefixed with `/api/wallet`

### Create Account

- **Base URL:** `localhost:3000/api/wallet/account`
- **URL:** `/api/wallet/account`
- **Method:** `POST`
- **Response:**
  ```json
  {
    "userId": "uuid-string",
    "balance": "0.00"
  }
  ```
- **Status Codes:**
  - 201: Account created
  - 500: Server error

### Get All Users

- **Base URL:** `localhost:3000/api/wallet/users`
- **Method:** `GET`
- **Response:**
  ```json
  [
    {
      "id": "uuid-string",
      "balance": "100.00",
      "created_at": "timestamp"
    }
  ]
  ```
- **Status Codes:**
  - 200: Success
  - 500: Server error

### Get User Details

- **Base URL:** `localhost:3000/api/wallet/users/:userId`
- **Method:** `GET`
- **Parameters:** `userId` (UUID)
- **Response:**
  ```json
  {
    "id": "uuid-string",
    "balance": "100.00",
    "created_at": "timestamp"
  }
  ```
- **Status Codes:**
  - 200: Success
  - 400: Invalid UUID format
  - 404: User not found

### Get Balance

- **Base URL:** `localhost:3000/api/wallet/users/:userId/balance`
- **Method:** `GET`
- **Parameters:** `userId` (UUID)
- **Response:**
  ```json
  {
    "userId": "uuid-string",
    "balance": "100.00"
  }
  ```
- **Status Codes:**
  - 200: Success
  - 400: Invalid UUID format
  - 404: User not found

### Top Up Balance

- **Base URL:** `localhost:3000/api/wallet/topup`
- **Headers Required:**
  - `Content-Type: application/json`
  - `Idempotency-Key: unique-key-123` (Optional)
- **Method:** `POST`
- **Body:**
  ```json
  {
    "userId": "uuid-string",
    "amount": "50.00"
  }
  ```
- **Response:**
  ```json
  {
    "userId": "uuid-string",
    "transactionId": "uuid-string",
    "newBalance": "150.00"
  }
  ```
- **Status Codes:**
  - 200: Success
  - 400: Invalid amount/UUID format
  - 404: User not found
  - 409: Duplicate transaction
  - 500: Server error
- **Rules:**
  - Amount must be positive
  - Maximum 2 decimal places
  - Automatic idempotency key generation

### Charge Account

- **Base URL:** `localhost:3000/api/wallet/charge`
- **Headers Required:**
  - `Content-Type: application/json`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "userId": "uuid-string",
    "amount": "50.00"
  }
  ```
- **Response:**
  ```json
  {
    "userId": "uuid-string",
    "transactionId": "uuid-string",
    "newBalance": "50.00"
  }
  ```
- **Status Codes:**
  - 200: Success
  - 400: Invalid amount/UUID format or insufficient balance
  - 404: User not found
  - 409: Duplicate transaction
  - 500: Server error
- **Rules:**
  - Amount must be positive
  - Maximum 2 decimal places
  - Balance cannot go negative
  - Automatic idempotency key generation

## Error Handling

All endpoints return error responses in the following format:

```json
{
  "error": "Error message description"
}
```

## Testing

The API includes comprehensive Jest tests covering:

- Account creation
- Balance operations
- Transaction validation
- Error scenarios
- Idempotency checks
- Decimal precision handling
