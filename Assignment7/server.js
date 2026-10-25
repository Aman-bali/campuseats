const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = require('./db');

// Read schema SDL from schema.graphql
const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8');

// Resolvers
const resolvers = {
  Query: {
    dishes: async () => {
      try {
        const [rows] = await pool.query('SELECT id, name, price, available FROM dishes ORDER BY id ASC');
        return rows.map((row) => ({
          id: String(row.id),
          name: row.name,
          price: parseFloat(row.price),
          available: Boolean(row.available),
        }));
      } catch (error) {
        console.error('Error fetching dishes from database:', error.message);
        throw new Error('Failed to retrieve dishes from the database.');
      }
    },
    dish: async (_, { id }) => {
      try {
        // Parameterized query: WHERE id = ?
        const [rows] = await pool.query('SELECT id, name, price, available FROM dishes WHERE id = ?', [id]);
        if (rows.length === 0) {
          return null;
        }
        const row = rows[0];
        return {
          id: String(row.id),
          name: row.name,
          price: parseFloat(row.price),
          available: Boolean(row.available),
        };
      } catch (error) {
        console.error(`Error fetching dish with ID ${id}:`, error.message);
        throw new Error(`Failed to retrieve dish with ID ${id}.`);
      }
    },
  },
  Mutation: {
    addDish: async (_, { input }) => {
      const { name, price, available } = input;

      // Server-side validation
      if (!name || typeof name !== 'string' || name.trim() === '') {
        throw new Error('Dish name cannot be empty.');
      }

      const numPrice = parseFloat(price);
      if (isNaN(numPrice) || numPrice < 0) {
        throw new Error('Dish price must be a valid non-negative number.');
      }

      // Default availability to true if omitted
      const isAvailable = available !== undefined ? Boolean(available) : true;

      try {
        // Parameterized INSERT query
        const [result] = await pool.query(
          'INSERT INTO dishes (name, price, available) VALUES (?, ?, ?)',
          [name.trim(), numPrice, isAvailable]
        );

        return {
          id: String(result.insertId),
          name: name.trim(),
          price: numPrice,
          available: isAvailable,
        };
      } catch (error) {
        console.error('Error inserting dish into database:', error.message);
        throw new Error('Failed to create new dish in the database.');
      }
    },
  },
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 4000;

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, 'public')));

  // Initialize Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  // Attach Apollo GraphQL middleware at /graphql
  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(server)
  );

  // Serve index.html explicitly for root GET /
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const httpServer = app.listen(PORT, () => {
    console.log(`🚀 CampusEats GraphQL Menu Service running on http://localhost:${PORT}`);
    console.log(`📊 GraphQL Endpoint available at http://localhost:${PORT}/graphql`);
    console.log(`🌐 Frontend UI available at http://localhost:${PORT}/`);
  });

  return { app, server, httpServer };
}

// Start standalone if executed directly
if (require.main === module) {
  startServer().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}

module.exports = { startServer, typeDefs, resolvers };
