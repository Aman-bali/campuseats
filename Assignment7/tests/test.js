/**
 * Automated test suite for CampusEats Assignment 7 GraphQL Service
 * Uses Apollo Server executeOperation and direct MySQL verification.
 */
const { ApolloServer } = require('@apollo/server');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pool = require('../db');
const { typeDefs, resolvers } = require('../server');

async function runTests() {
  console.log('🧪 Starting CampusEats GraphQL Test Suite...\n');
  let passed = 0;
  let failed = 0;

  // Initialize test ApolloServer instance
  const testServer = new ApolloServer({
    typeDefs,
    resolvers,
  });

  try {
    // Test 1: Verify MySQL connection pool
    console.log('Test 1: Testing MySQL connection pool...');
    const [dbCheck] = await pool.query('SELECT 1 as connected');
    assert.strictEqual(dbCheck[0].connected, 1, 'Database connection failed');
    console.log('  ✅ MySQL pool connected successfully.\n');
    passed++;

    // Test 2: Query all dishes
    console.log('Test 2: Testing Query.dishes...');
    const listRes = await testServer.executeOperation({
      query: 'query { dishes { id name price available } }',
    });
    assert.strictEqual(listRes.body.kind, 'single');
    assert(!listRes.body.singleResult.errors, 'Query dishes returned errors');
    const dishes = listRes.body.singleResult.data.dishes;
    assert(Array.isArray(dishes), 'dishes should be an array');
    assert(dishes.length >= 4, 'Should contain at least 4 seeded dishes');

    // Verify types
    const firstDish = dishes[0];
    assert.strictEqual(typeof firstDish.id, 'string', 'id should be String/ID');
    assert.strictEqual(typeof firstDish.name, 'string', 'name should be String');
    assert.strictEqual(typeof firstDish.price, 'number', 'price should be Float/number');
    assert.strictEqual(typeof firstDish.available, 'boolean', 'available should be Boolean');
    console.log(`  ✅ Successfully retrieved ${dishes.length} dishes from database.`);
    console.log(`     Sample dish: #${firstDish.id} "${firstDish.name}" ₹${firstDish.price} (available: ${firstDish.available})\n`);
    passed++;

    // Test 3: Query dish by existing ID
    console.log('Test 3: Testing Query.dish(id: "1")...');
    const byIdRes = await testServer.executeOperation({
      query: 'query GetDish($id: ID!) { dish(id: $id) { id name price available } }',
      variables: { id: '1' },
    });
    assert.strictEqual(byIdRes.body.kind, 'single');
    assert(!byIdRes.body.singleResult.errors, 'Query dish by id returned errors');
    const dish1 = byIdRes.body.singleResult.data.dish;
    assert(dish1 !== null, 'Dish #1 should exist');
    assert.strictEqual(dish1.id, '1');
    assert.strictEqual(dish1.name, 'Paneer Butter Masala');
    assert.strictEqual(dish1.price, 180);
    assert.strictEqual(dish1.available, true);
    console.log(`  ✅ Successfully retrieved dish #1: ${dish1.name}\n`);
    passed++;

    // Test 4: Query dish by non-existent ID
    console.log('Test 4: Testing Query.dish with non-existent ID (99999)...');
    const nonExistentRes = await testServer.executeOperation({
      query: 'query GetDish($id: ID!) { dish(id: $id) { id name price available } }',
      variables: { id: '99999' },
    });
    assert.strictEqual(nonExistentRes.body.kind, 'single');
    assert(!nonExistentRes.body.singleResult.errors);
    assert.strictEqual(nonExistentRes.body.singleResult.data.dish, null, 'Non-existent dish should be null');
    console.log('  ✅ Correctly returned null for non-existent ID.\n');
    passed++;

    // Test 5: Mutation addDish with omitted available (defaulting to true)
    console.log('Test 5: Testing Mutation.addDish with omitted "available" (defaults to true)...');
    const testDishName = `Paneer Roll Test-${Date.now()}`;
    const addDishRes = await testServer.executeOperation({
      query: `
        mutation AddDish($input: AddDishInput!) {
          addDish(input: $input) {
            id
            name
            price
            available
          }
        }
      `,
      variables: {
        input: {
          name: testDishName,
          price: 90.0,
        },
      },
    });
    assert.strictEqual(addDishRes.body.kind, 'single');
    assert(!addDishRes.body.singleResult.errors, 'Mutation addDish returned errors');
    const newDish = addDishRes.body.singleResult.data.addDish;
    assert(newDish.id, 'New dish must have an ID');
    assert.strictEqual(newDish.name, testDishName);
    assert.strictEqual(newDish.price, 90.0);
    assert.strictEqual(newDish.available, true, 'Omitted available field must default to true');
    console.log(`  ✅ Successfully created dish: #${newDish.id} "${newDish.name}" (price: ₹${newDish.price}, available: ${newDish.available})\n`);
    passed++;

    // Test 6: Verify database persistence in MySQL
    console.log('Test 6: Verifying direct MySQL persistence for inserted dish...');
    const [persistedRows] = await pool.query('SELECT * FROM dishes WHERE id = ?', [newDish.id]);
    assert.strictEqual(persistedRows.length, 1, 'Dish should be found directly in MySQL');
    assert.strictEqual(persistedRows[0].name, testDishName);
    assert.strictEqual(parseFloat(persistedRows[0].price), 90.0);
    console.log('  ✅ Direct MySQL query confirmed record persistence.\n');
    passed++;

    // Test 7: Validation - Empty name rejection
    console.log('Test 7: Testing validation - Empty dish name rejection...');
    const emptyNameRes = await testServer.executeOperation({
      query: `
        mutation {
          addDish(input: { name: "   ", price: 50.0 }) {
            id
            name
          }
        }
      `,
    });
    assert(emptyNameRes.body.singleResult.errors, 'Server should reject empty dish name');
    console.log(`  ✅ Correctly rejected empty name: "${emptyNameRes.body.singleResult.errors[0].message}"\n`);
    passed++;

    // Test 8: Validation - Negative price rejection
    console.log('Test 8: Testing validation - Negative price rejection...');
    const negPriceRes = await testServer.executeOperation({
      query: `
        mutation {
          addDish(input: { name: "Invalid Item", price: -25.0 }) {
            id
            name
          }
        }
      `,
    });
    assert(negPriceRes.body.singleResult.errors, 'Server should reject negative price');
    console.log(`  ✅ Correctly rejected negative price: "${negPriceRes.body.singleResult.errors[0].message}"\n`);
    passed++;

    // Clean up test dish inserted during Test 5
    await pool.query('DELETE FROM dishes WHERE id = ?', [newDish.id]);

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    failed++;
  } finally {
    await pool.end();
  }

  console.log('==================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed.`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
