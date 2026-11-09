/**
 * CampusEats — CS543 Assignment 09
 * In-Memory Catalogue Store (Reused from Assignment 08)
 */

const initialSeedItems = [
  {
    id: 1,
    name: "Paneer Butter Masala",
    price: 180.00,
    available: true,
    category: "North Indian"
  },
  {
    id: 2,
    name: "Masala Dosa",
    price: 80.00,
    available: true,
    category: "South Indian"
  },
  {
    id: 3,
    name: "Veg Hakka Noodles",
    price: 120.00,
    available: true,
    category: "Chinese"
  },
  {
    id: 4,
    name: "Cold Coffee with Ice Cream",
    price: 70.00,
    available: false,
    category: "Beverages"
  }
];

let items = initialSeedItems.map(item => ({ ...item }));
let nextId = items.length + 1;

function getAllItems() {
  return items;
}

function getItemById(id) {
  const numericId = Number(id);
  return items.find(item => item.id === numericId) || null;
}

function addItem({ name, price, available, category }) {
  const newItem = {
    id: nextId++,
    name: name.trim(),
    price: parseFloat(Number(price).toFixed(2)),
    available: Boolean(available),
    category: (category && typeof category === 'string' && category.trim()) ? category.trim() : "Campus Special"
  };
  items.push(newItem);
  return newItem;
}

function resetItemSeeds() {
  items = initialSeedItems.map(item => ({ ...item }));
  nextId = items.length + 1;
}

module.exports = {
  getAllItems,
  getItemById,
  addItem,
  resetItemSeeds
};
