/**
 * CampusEats — CS543 Web Services: Assignment 09 of 12
 * Securing the API: JWT Authentication and Role-Based Authorization
 * 
 * Team ID: 12
 * Members:
 *  1. Aman Bali       (Roll: 20251651015)
 *  2. Bhupesh Kumar   (Roll: 20251651032)
 * Course Instructor: Dr. Pramit Mazumdar (IIIT Vadodara)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import separated in-memory stores
const { getUsers, findUserByEmail, resetUserSeeds } = require('./data/users');
const { getAllItems, getItemById, addItem, resetItemSeeds } = require('./data/items');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. Strict JWT Secret Management
// ==========================================
// Read the secret exclusively from process.env.JWT_SECRET.
// Halt application startup if the secret is missing.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.trim() === '') {
  const errorMsg = '[FATAL CONFIG ERROR] JWT_SECRET environment variable is missing. Halting application startup.';
  console.error(errorMsg);
  if (require.main === module) {
    process.exit(1);
  } else {
    throw new Error(errorMsg);
  }
}

// ==========================================
// Middleware Configuration
// ==========================================

// Parse incoming JSON payloads with body size limit to prevent memory exhaustion
app.use(express.json({ limit: '64kb' }));

// Serve interactive testing Security Console
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// In-Memory Login Rate Limiter
// ==========================================
// Mitigates credential brute-force attacks against POST /login
const loginRateLimitMap = new Map();

function loginRateLimiter(req, res, next) {
  const clientIdentifier = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute sliding window
  const maxAttempts = 10; // Max 10 login requests per window

  const clientRecord = loginRateLimitMap.get(clientIdentifier);

  if (!clientRecord || now > clientRecord.resetTime) {
    loginRateLimitMap.set(clientIdentifier, {
      count: 1,
      resetTime: now + windowMs
    });
    return next();
  }

  clientRecord.count++;
  if (clientRecord.count > maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((clientRecord.resetTime - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Too many login attempts. Please try again in ${retryAfterSeconds} seconds.`,
      retryAfter: retryAfterSeconds
    });
  }

  return next();
}

function resetRateLimits() {
  loginRateLimitMap.clear();
}

// ==========================================
// Authentication & Authorization Guards
// ==========================================

/**
 * Guard 1: auth
 * Verifies that the client provided a valid Bearer JWT.
 * Restricts algorithm explicitly to HS256.
 * Validates required identity claims: id, email, and valid role.
 * Decodes the payload and attaches it to req.user.
 * Rejects with HTTP 401 if token is missing, malformed, invalid, or expired.
 */
function auth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authorization header missing. Expected format: Bearer <token>"
    });
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Malformed Authorization header. Format must be 'Bearer <token>'."
    });
  }

  const token = parts[1];
  if (!token || token.trim() === '') {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Bearer token cannot be empty."
    });
  }

  try {
    // Explicitly restrict algorithm to HS256 to prevent algorithm switching attacks
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // Validate essential payload identity claims
    if (!decoded || typeof decoded !== 'object' || !decoded.id || !decoded.email || !decoded.role) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token claims: token payload missing required fields (id, email, role)."
      });
    }

    const validRoles = ['customer', 'restaurant', 'admin'];
    if (!validRoles.includes(decoded.role)) {
      return res.status(401).json({
        error: "Unauthorized",
        message: `Invalid role claim '${decoded.role}' in token payload.`
      });
    }

    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token has expired. Please log in again."
      });
    }
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or tampered token."
    });
  }
}

/**
 * Guard 2: requireRole(...allowedRoles)
 * Verifies that the authenticated user possesses one of the allowed roles.
 * Must execute after `auth`.
 * Rejects with HTTP 403 Forbidden if the role is unauthorized.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Ensure authentication has already been performed
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required before role verification."
      });
    }

    // Role must be derived strictly from verified JWT claims (never req.body or headers)
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Forbidden: role '${req.user.role}' is not authorized to perform this action. Required role(s): [${allowedRoles.join(', ')}]`
      });
    }

    return next();
  };
}

// ==========================================
// Assignment 09 API Routes
// ==========================================

/**
 * POST /login
 * Authenticates user credentials using bcrypt.compareSync.
 * Applies rate limiting to reduce brute-force attempts.
 * Normalizes email input and returns consistent error messages.
 * Issues signed HS256 JWT with 1 hour expiration.
 */
app.post('/login', loginRateLimiter, (req, res) => {
  const { email, password } = req.body || {};

  // Validate non-empty string input
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      error: "Bad Request",
      message: "Both 'email' and 'password' fields are required non-empty strings."
    });
  }

  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  if (!trimmedEmail || !trimmedPassword) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Both 'email' and 'password' fields are required non-empty strings."
    });
  }

  // Normalize email to lowercase
  const normalizedEmail = trimmedEmail.toLowerCase();
  const user = findUserByEmail(normalizedEmail);

  // Consistent generic error to prevent account enumeration
  if (!user || !user.passwordHash) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid email or password."
    });
  }

  // Verify password using bcrypt.compareSync as specified in Assignment 09
  const isPasswordValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid email or password."
    });
  }

  // Issue HS256 signed JWT with role claim and 1 hour expiration
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1h'
    }
  );

  return res.status(200).json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  });
});

/**
 * GET /items
 * Protected by: auth (requires valid JWT)
 * Returns the full catalogue of menu items.
 */
app.get('/items', auth, (req, res) => {
  return res.status(200).json(getAllItems());
});

/**
 * GET /items/:id
 * Protected by: auth (requires valid JWT)
 * Strictly validates numeric ID format.
 * Returns a specific menu item or 404 if not found / malformed.
 */
app.get('/items/:id', auth, (req, res) => {
  const rawId = req.params.id;

  // Strict integer validation (reject negative, decimals, non-digits)
  if (!/^[1-9]\d*$/.test(rawId)) {
    return res.status(404).json({
      error: "Item not found",
      message: `Invalid ID format '${rawId}'. Item ID must be a positive integer.`
    });
  }

  const foundItem = getItemById(rawId);
  if (!foundItem) {
    return res.status(404).json({
      error: "Item not found",
      message: `Menu item with ID ${rawId} does not exist in the catalogue.`
    });
  }

  return res.status(200).json(foundItem);
});

/**
 * POST /items
 * Protected by: auth, requireRole('restaurant', 'admin')
 * Customer role is rejected with HTTP 403 Forbidden.
 * Strictly validates name, price, availability, and category.
 */
app.post('/items', auth, requireRole('restaurant', 'admin'), (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(422).json({
      error: "Validation failed",
      message: "Request body must be a valid JSON object."
    });
  }

  const { name, price, available, category } = body;

  // Validation 1: Required field 'name'
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return res.status(422).json({
      error: "Validation failed",
      field: "name",
      message: "The 'name' field is required and must be a non-empty string between 2 and 100 characters."
    });
  }

  // Validation 2: Required field 'price'
  if (price === undefined || price === null || price === '') {
    return res.status(422).json({
      error: "Validation failed",
      field: "price",
      message: "The 'price' field is required."
    });
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return res.status(422).json({
      error: "Validation failed",
      field: "price",
      message: "The 'price' field must be a valid, finite non-negative number."
    });
  }

  // Validation 3: Field 'available'
  let isAvailable = true;
  if (available !== undefined && available !== null) {
    if (typeof available === 'boolean') {
      isAvailable = available;
    } else if (typeof available === 'string') {
      const lower = available.trim().toLowerCase();
      if (lower === 'true') isAvailable = true;
      else if (lower === 'false') isAvailable = false;
      else {
        return res.status(422).json({
          error: "Validation failed",
          field: "available",
          message: "The 'available' field must be a boolean (true/false)."
        });
      }
    } else {
      return res.status(422).json({
        error: "Validation failed",
        field: "available",
        message: "The 'available' field must be a boolean."
      });
    }
  }

  // Validation 4: Optional field 'category'
  let sanitizedCategory = "Campus Special";
  if (category !== undefined && category !== null) {
    if (typeof category !== 'string' || category.trim().length === 0 || category.trim().length > 50) {
      return res.status(422).json({
        error: "Validation failed",
        field: "category",
        message: "The 'category' field, if provided, must be a string up to 50 characters."
      });
    }
    sanitizedCategory = category.trim();
  }

  const newItem = addItem({
    name: name.trim(),
    price: numericPrice,
    available: isAvailable,
    category: sanitizedCategory
  });

  return res.status(201).json(newItem);
});

// ==========================================
// Centralized Error Handling Middleware
// ==========================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Malformed JSON payload in request body."
    });
  }
  console.error('[Unhandled Server Error]:', err.message);
  return res.status(500).json({
    error: "Internal Server Error",
    message: "An internal server error occurred."
  });
});

// Helper to reset seed data across stores
function resetSeedData() {
  resetItemSeeds();
  resetUserSeeds();
  resetRateLimits();
}

// Start the server if executed directly
let serverInstance = null;
if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  CampusEats — CS543 Assignment 09: Securing the API`);
    console.log(`  Team ID: 12 · Aman Bali & Bhupesh Kumar`);
    console.log(`=======================================================`);
    console.log(`  Server running at:   http://localhost:${PORT}`);
    console.log(`  POST /login          http://localhost:${PORT}/login`);
    console.log(`  GET  /items (auth)   http://localhost:${PORT}/items`);
    console.log(`  POST /items (role)   http://localhost:${PORT}/items`);
    console.log(`  Interactive Console: http://localhost:${PORT}/`);
    console.log(`=======================================================`);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[PORT CONFLICT] Port ${PORT} is already in use by another process.`);
      console.error(`The server is likely already running in another window or background process.`);
      console.error(`- To access the app: Open http://localhost:${PORT} in your browser.`);
      console.error(`- To kill the existing process: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
      process.exit(1);
    } else {
      console.error('[Server Error]:', err);
      process.exit(1);
    }
  });
}

module.exports = {
  app,
  auth,
  requireRole,
  resetSeedData,
  resetRateLimits,
  getItems: getAllItems,
  getUsers,
  JWT_SECRET
};
