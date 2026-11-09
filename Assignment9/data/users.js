/**
 * CampusEats — CS543 Assignment 09
 * Demonstration User Repository & In-Memory Store
 * 
 * Passwords are salted and hashed using bcryptjs (cost factor 10).
 * Plain-text passwords are NEVER stored in memory or in database records.
 */

const bcrypt = require('bcryptjs');

const BCRYPT_SALT_ROUNDS = 10;

// Seed demonstration user definitions
const initialSeedUsers = [
  {
    id: 'user_cust_001',
    email: 'customer@campuseats.com',
    passwordHash: bcrypt.hashSync('customer123', BCRYPT_SALT_ROUNDS),
    role: 'customer'
  },
  {
    id: 'user_rest_001',
    email: 'restaurant@campuseats.com',
    passwordHash: bcrypt.hashSync('restaurant123', BCRYPT_SALT_ROUNDS),
    role: 'restaurant'
  },
  {
    id: 'user_admin_001',
    email: 'admin@campuseats.com',
    passwordHash: bcrypt.hashSync('admin123', BCRYPT_SALT_ROUNDS),
    role: 'admin'
  }
];

// In-memory store
let users = [...initialSeedUsers];

/**
 * Find user by normalized email (case-insensitive)
 */
function findUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return users.find(u => u.email.toLowerCase() === normalized) || null;
}

/**
 * Find user by ID
 */
function findUserById(id) {
  if (!id) return null;
  return users.find(u => u.id === id) || null;
}

/**
 * Reset demonstration users back to baseline seed
 */
function resetUserSeeds() {
  users = initialSeedUsers.map(u => ({ ...u }));
}

module.exports = {
  getUsers: () => users,
  findUserByEmail,
  findUserById,
  resetUserSeeds,
  BCRYPT_SALT_ROUNDS
};
